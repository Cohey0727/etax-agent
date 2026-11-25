/**
 * invoiceDocuments.ts — 請求書（帳票）の作成・更新・削除・発行・修正用
 * 下書き作成・PDF取得の共通処理（services/invoice）。
 *
 * REST（usecases）と MCP（services/mcp）の両方から使う。発行済み帳票の
 * 不変、修正は「修正した適格請求書」の新規発行で行う、発行時の記載事項
 * 検証（登録番号の自動生成・補完はしない）といった業務ルールをここへ
 * 集約し、呼び出し経路で結果がずれないようにする。
 */
import { Db } from "../../lib/db";
import {
  deleteInvoice,
  fetchInvoiceResponse,
  getInvoiceRow,
  insertInvoice,
  InvoiceHeaderDraft,
  InvoiceLineDraft,
  listInvoiceLines,
  markInvoiceIssued,
  nextDocumentNumber,
  updateInvoice,
} from "../../repositories/invoiceRepository";
import {
  CreateInvoiceRequest,
  InvoiceResponse,
  UpdateInvoiceRequest,
} from "../../schemas/invoice";
import { buildInvoicePdf } from "../pdf/buildInvoicePdf";
import { loadJapaneseFont } from "../pdf/loadJapaneseFont";
import { toInvoiceDrafts } from "./invoiceDraft";
import { resolveIssuerProfile } from "./resolveIssuerProfile";
import { buildIssuerSnapshot, validateInvoiceIssue } from "./validateInvoiceIssue";

/** 請求書まわりの業務エラー。status は REST 側の HTTP ステータスに対応する。 */
export class InvoiceDocumentError extends Error {
  readonly status: 400 | 404 | 503;

  constructor(status: 400 | 404 | 503, message: string) {
    super(message);
    this.name = "InvoiceDocumentError";
    this.status = status;
  }
}

/** JST の今日（YYYY-MM-DD）。サーバーのタイムゾーンに依存しない。 */
function todayInTokyo(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 請求書（下書き）を作成する。 */
export async function createInvoiceDocument(
  db: Db,
  request: CreateInvoiceRequest,
): Promise<InvoiceResponse | null> {
  const { header, lines } = toInvoiceDrafts(request);
  const row = await insertInvoice(db, header, lines, null);
  return row ? fetchInvoiceResponse(db, row) : null;
}

/**
 * 請求書（下書き）を更新する。発行済みの帳票は不変のため拒む。
 * 内容の誤りは「修正した適格請求書」を新規発行して直す。
 */
export async function updateInvoiceDocument(
  db: Db,
  id: number,
  request: UpdateInvoiceRequest,
): Promise<InvoiceResponse> {
  const existing = await getInvoiceRow(db, id);
  if (!existing) throw new InvoiceDocumentError(404, "請求書が見つかりません");
  if (existing.status === "issued") {
    throw new InvoiceDocumentError(
      400,
      "発行済みの請求書は変更できません。修正は「修正した適格請求書」の新規発行で行ってください",
    );
  }
  const { header, lines } = toInvoiceDrafts(request);
  const row = await updateInvoice(db, id, header, lines);
  if (!row) throw new InvoiceDocumentError(404, "請求書が見つかりません");
  return fetchInvoiceResponse(db, row);
}

/**
 * 請求書（下書き）を削除する。発行済みの帳票は写しの保存義務（7年）が
 * あるため削除できない。
 */
export async function deleteInvoiceDocument(db: Db, id: number): Promise<void> {
  const existing = await getInvoiceRow(db, id);
  if (!existing) throw new InvoiceDocumentError(404, "請求書が見つかりません");
  if (existing.status === "issued") {
    throw new InvoiceDocumentError(
      400,
      "発行済みの請求書は削除できません（写しは7年間の保存が必要です）",
    );
  }
  const deleted = await deleteInvoice(db, id);
  if (!deleted) throw new InvoiceDocumentError(404, "請求書が見つかりません");
}

/**
 * 請求書を発行する（採番＋発行者情報のスナップショット凍結＋不変化）。
 * 適格請求書として発行する場合は、消費税法57条の4第1項の記載事項が
 * 欠けていないことを発行前に検証する（登録番号はプロフィールの値を
 * そのまま使い、自動生成・補完はしない）。
 */
export async function issueInvoiceDocument(db: Db, id: number): Promise<InvoiceResponse> {
  const row = await getInvoiceRow(db, id);
  if (!row) throw new InvoiceDocumentError(404, "請求書が見つかりません");
  if (row.status === "issued") {
    throw new InvoiceDocumentError(400, "すでに発行済みです");
  }
  const lines = await listInvoiceLines(db, id);
  const year = Number(row.issueDate.slice(0, 4));
  const profile = await resolveIssuerProfile(
    db,
    Number.isInteger(year) ? year : new Date().getFullYear(),
  );
  const problems = validateInvoiceIssue(
    {
      is_qualified: row.isQualified,
      counterparty_name: row.counterpartyName,
      issue_date: row.issueDate,
      lines: lines.map((line) => ({
        item_name: line.itemName,
        tax_rate_percent: line.taxRatePercent,
        is_reduced_rate: line.isReducedRate,
      })),
    },
    profile,
  );
  if (problems.length > 0) {
    throw new InvoiceDocumentError(400, problems.join("／"));
  }
  const documentNumber = await nextDocumentNumber(db, row.issueDate);
  const issuer = buildIssuerSnapshot(profile, row.isQualified);
  const issued = await markInvoiceIssued(db, id, documentNumber, issuer);
  if (!issued) throw new InvoiceDocumentError(400, "すでに発行済みです");
  return fetchInvoiceResponse(db, issued);
}

/**
 * 「修正した適格請求書」の下書きを作成する。発行済み帳票は不変のため、
 * 元帳票をコピーした新しい下書きを作り、修正元への参照を付ける
 * （消費税法57条の4第4項）。発行日は当日で初期化する。
 */
export async function createInvoiceCorrectionDraft(
  db: Db,
  id: number,
): Promise<InvoiceResponse | null> {
  const source = await getInvoiceRow(db, id);
  if (!source) throw new InvoiceDocumentError(404, "請求書が見つかりません");
  if (source.status !== "issued") {
    throw new InvoiceDocumentError(
      400,
      "修正用下書きは発行済みの請求書からだけ作れます（下書きはそのまま編集してください）",
    );
  }
  const sourceLines = await listInvoiceLines(db, id);
  const header: InvoiceHeaderDraft = {
    issue_date: todayInTokyo(),
    due_date: source.dueDate,
    counterparty_name: source.counterpartyName,
    counterparty_address: source.counterpartyAddress,
    is_qualified: source.isQualified,
    tax_rounding: source.taxRounding as InvoiceHeaderDraft["tax_rounding"],
    memo: source.memo,
  };
  const lines: InvoiceLineDraft[] = sourceLines.map((line) => ({
    item_name: line.itemName,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unitPrice,
    tax_rate_percent: line.taxRatePercent,
    is_reduced_rate: line.isReducedRate,
  }));
  const row = await insertInvoice(db, header, lines, source.id);
  return row ? fetchInvoiceResponse(db, row) : null;
}

/**
 * 発行済み請求書の PDF を生成する。発行者スナップショットと採番が
 * 凍結されているため、再取得でも発行時と同じ帳票が再現される。
 */
export async function getInvoicePdf(
  db: Db,
  id: number,
): Promise<{ filename: string; pdf: Uint8Array }> {
  const row = await getInvoiceRow(db, id);
  if (!row) throw new InvoiceDocumentError(404, "請求書が見つかりません");
  if (row.status !== "issued") {
    throw new InvoiceDocumentError(
      400,
      "PDFは発行済みの請求書だけダウンロードできます（先に発行してください）",
    );
  }
  const invoice = await fetchInvoiceResponse(db, row);
  const fontBytes = await loadJapaneseFont();
  if (!fontBytes) {
    throw new InvoiceDocumentError(
      503,
      "PDF用の日本語フォントがサーバーに配置されていません。データフォルダの fonts/ に日本語フォント（ipaexg.ttf 等）を置いてください。",
    );
  }
  const pdf = await buildInvoicePdf(invoice, fontBytes);
  return { filename: `invoice-${invoice.document_number ?? id}.pdf`, pdf };
}
