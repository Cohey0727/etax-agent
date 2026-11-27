/**
 * invoiceRepository.ts — 帳票（請求書）テーブルへのデータアクセス（repositories）。
 *
 * 行 → API 形式（snake_case）への変換もここで行う。集計（税率ごとの合計と
 * 消費税額）は shared の決定的関数で都度計算し、帳票行に税込合計と集計
 * スナップショットとして保存する（発行後は更新自体が起きないため凍結される）。
 * 発行済み帳票は不変: 更新・削除は下書きに限ることを呼び出し側（usecases）が
 * 担保し、リポジトリの発行処理は status = draft の行にだけ効く条件で守る。
 */
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import {
  computeInvoiceTotals,
  invoiceLineAmount,
  InvoiceLineInput,
  InvoiceSettlement,
  InvoiceTaxRounding,
} from "@etax/shared";
import { settlementSummaries } from "./reconciliationRepository";
import { Db, DbOrTx } from "../lib/db";
import { currentUserId, ownerIdForWrite } from "../lib/tenantContext";
import {
  InvoiceIssuer,
  InvoiceLineResponse,
  InvoiceResponse,
  InvoiceTotalsResponse,
} from "../schemas/invoice";
import {
  DocumentLineRow,
  DocumentRow,
  documentLinesTable,
  documentsTable,
  NewDocumentLineRow,
  NewDocumentRow,
} from "./schema";

/** 明細の入力（API 形式）。金額はサーバー側で確定させるため入力には含めない。 */
export interface InvoiceLineDraft {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate_percent: number;
  is_reduced_rate: boolean;
}

/** 帳票ヘッダの入力（API 形式）。 */
export interface InvoiceHeaderDraft {
  issue_date: string;
  due_date: string | null;
  counterparty_name: string;
  counterparty_address: string;
  is_qualified: boolean;
  tax_rounding: InvoiceTaxRounding;
  memo: string;
}

function toSharedLine(line: InvoiceLineDraft): InvoiceLineInput {
  return {
    itemName: line.item_name,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unit_price,
    taxRatePercent: line.tax_rate_percent,
    isReducedRate: line.is_reduced_rate,
  };
}

/** shared の集計を API 形式（snake_case）へ変換する。 */
export function totalsToApi(lines: InvoiceLineDraft[], rounding: InvoiceTaxRounding): InvoiceTotalsResponse {
  const totals = computeInvoiceTotals(lines.map(toSharedLine), rounding);
  return {
    groups: totals.groups.map((group) => ({
      tax_rate_percent: group.taxRatePercent,
      subtotal: group.subtotal,
      tax: group.tax,
    })),
    subtotal: totals.subtotal,
    tax_total: totals.taxTotal,
    total: totals.total,
  };
}

function lineToApi(row: DocumentLineRow): InvoiceLineResponse {
  return {
    id: row.id,
    item_name: row.itemName,
    quantity: row.quantity,
    unit: row.unit,
    unit_price: row.unitPrice,
    tax_rate_percent: row.taxRatePercent,
    is_reduced_rate: row.isReducedRate,
    amount: row.amount,
  };
}

/** DB行＋明細を API レスポンス形式へ変換する。settlement は消込サマリ（発行済みのみ）。 */
export function invoiceToApi(
  row: DocumentRow,
  lines: DocumentLineRow[],
  correctsDocumentNumber: string | null,
  settlement?: InvoiceSettlement,
): InvoiceResponse {
  const drafts: InvoiceLineDraft[] = lines.map((line) => ({
    item_name: line.itemName,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unitPrice,
    tax_rate_percent: line.taxRatePercent,
    is_reduced_rate: line.isReducedRate,
  }));
  const rounding = row.taxRounding as InvoiceTaxRounding;
  const totals =
    (row.totalsSnapshot as InvoiceTotalsResponse | null) ?? totalsToApi(drafts, rounding);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status === "issued" ? "issued" : "draft",
    document_number: row.documentNumber,
    issue_date: row.issueDate,
    due_date: row.dueDate,
    counterparty_name: row.counterpartyName,
    counterparty_address: row.counterpartyAddress,
    is_qualified: row.isQualified,
    tax_rounding: rounding,
    memo: row.memo,
    corrects_document_id: row.correctsDocumentId,
    corrects_document_number: correctsDocumentNumber,
    issuer: (row.issuerSnapshot as InvoiceIssuer | null) ?? null,
    lines: lines.map(lineToApi),
    totals,
    payment_status:
      row.status === "issued" && settlement ? settlement.status : null,
    settled_amount: settlement?.settledAmount ?? 0,
    remaining_amount: settlement?.remainingAmount ?? totals.total,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** id 指定の所有者条件（他テナントの帳票は「存在しない」として扱う）。 */
function invoiceIdCondition(id: number) {
  const owner = currentUserId();
  const conditions = [eq(documentsTable.id, id)];
  if (owner !== undefined) conditions.push(eq(documentsTable.ownerUserId, owner));
  return and(...conditions);
}

export async function getInvoiceRow(db: Db, id: number): Promise<DocumentRow | null> {
  const rows = await db.select().from(documentsTable).where(invoiceIdCondition(id));
  return rows[0] ?? null;
}

/**
 * 帳票を行ロックして取得する（トランザクション内で使う）。同じ請求書への
 * 消込を直列にし、請求残額の検証から記録までの間に他の消込が割り込まない
 * ようにする。
 */
export async function lockInvoiceRow(tx: DbOrTx, id: number): Promise<DocumentRow | null> {
  const rows = await tx
    .select()
    .from(documentsTable)
    .where(invoiceIdCondition(id))
    .for("update");
  return rows[0] ?? null;
}

export async function listInvoiceLines(db: Db, documentId: number): Promise<DocumentLineRow[]> {
  return db
    .select()
    .from(documentLinesTable)
    .where(eq(documentLinesTable.documentId, documentId))
    .orderBy(asc(documentLinesTable.lineOrder), asc(documentLinesTable.id));
}

/**
 * 指定した帳票のうち、「修正した適格請求書」が発行済みのもの（当初分）の id。
 * 修正分は当初分の全明細を写した置き換えの帳票なので、当初分の未消込額は
 * 入金予定・消込候補に数えない。
 */
export async function listCorrectedInvoiceIds(
  db: DbOrTx,
  ids: readonly number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const owner = currentUserId();
  const conditions = [
    eq(documentsTable.status, "issued"),
    inArray(documentsTable.correctsDocumentId, [...ids]),
  ];
  if (owner !== undefined) conditions.push(eq(documentsTable.ownerUserId, owner));
  const rows = await db
    .select({ correctsDocumentId: documentsTable.correctsDocumentId })
    .from(documentsTable)
    .where(and(...conditions));
  return new Set(rows.flatMap((row) => (row.correctsDocumentId === null ? [] : [row.correctsDocumentId])));
}

/** 発行控えの検索条件（日付範囲・金額範囲・交付先/番号の部分一致・ステータス）。 */
export interface InvoiceListFilters {
  q?: string;
  from?: string;
  to?: string;
  minTotal?: number;
  maxTotal?: number;
  status?: string;
}

export async function listInvoiceRows(db: Db, filters: InvoiceListFilters): Promise<DocumentRow[]> {
  const owner = currentUserId();
  const conditions = [];
  if (owner !== undefined) conditions.push(eq(documentsTable.ownerUserId, owner));
  if (filters.q) {
    const pattern = `%${filters.q}%`;
    conditions.push(
      or(ilike(documentsTable.counterpartyName, pattern), ilike(documentsTable.documentNumber, pattern)),
    );
  }
  if (filters.from) conditions.push(gte(documentsTable.issueDate, filters.from));
  if (filters.to) conditions.push(lte(documentsTable.issueDate, filters.to));
  if (filters.minTotal !== undefined) conditions.push(gte(documentsTable.totalAmount, filters.minTotal));
  if (filters.maxTotal !== undefined) conditions.push(lte(documentsTable.totalAmount, filters.maxTotal));
  if (filters.status) conditions.push(eq(documentsTable.status, filters.status));
  const query = db.select().from(documentsTable);
  const scoped = conditions.length > 0 ? query.where(and(...conditions)) : query;
  return scoped.orderBy(desc(documentsTable.issueDate), desc(documentsTable.id));
}

function headerValues(header: InvoiceHeaderDraft, lines: InvoiceLineDraft[]): Partial<NewDocumentRow> {
  const totals = totalsToApi(lines, header.tax_rounding);
  return {
    issueDate: header.issue_date,
    dueDate: header.due_date,
    counterpartyName: header.counterparty_name,
    counterpartyAddress: header.counterparty_address,
    isQualified: header.is_qualified,
    taxRounding: header.tax_rounding,
    memo: header.memo,
    totalsSnapshot: totals,
    totalAmount: totals.total,
  };
}

function lineValues(documentId: number, lines: InvoiceLineDraft[]): NewDocumentLineRow[] {
  return lines.map((line, index) => ({
    documentId,
    lineOrder: index,
    itemName: line.item_name,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unit_price,
    taxRatePercent: line.tax_rate_percent,
    isReducedRate: line.is_reduced_rate,
    amount: invoiceLineAmount(toSharedLine(line)),
  }));
}

/** 帳票（下書き）を明細ごと登録する。 */
export async function insertInvoice(
  db: Db,
  header: InvoiceHeaderDraft,
  lines: InvoiceLineDraft[],
  correctsDocumentId: number | null,
): Promise<DocumentRow | null> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(documentsTable)
      .values({
        ...headerValues(header, lines),
        kind: "invoice",
        status: "draft",
        correctsDocumentId,
        ownerUserId: ownerIdForWrite(),
      })
      .returning();
    const row = inserted[0];
    if (!row) return null;
    if (lines.length > 0) {
      await tx.insert(documentLinesTable).values(lineValues(row.id, lines));
    }
    return row;
  });
}

/** 下書きの帳票をヘッダ＋明細まるごと差し替える。発行済みには効かない。 */
export async function updateInvoice(
  db: Db,
  id: number,
  header: InvoiceHeaderDraft,
  lines: InvoiceLineDraft[],
): Promise<DocumentRow | null> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(documentsTable)
      .set({ ...headerValues(header, lines), updatedAt: new Date() })
      .where(and(invoiceIdCondition(id), eq(documentsTable.status, "draft")))
      .returning();
    const row = updated[0];
    if (!row) return null;
    await tx.delete(documentLinesTable).where(eq(documentLinesTable.documentId, id));
    if (lines.length > 0) {
      await tx.insert(documentLinesTable).values(lineValues(id, lines));
    }
    return row;
  });
}

/** 下書きの帳票を削除する（明細は CASCADE で消える）。発行済みは削除できない。 */
export async function deleteInvoice(db: Db, id: number): Promise<boolean> {
  const deleted = await db
    .delete(documentsTable)
    .where(and(invoiceIdCondition(id), eq(documentsTable.status, "draft")))
    .returning();
  return deleted.length > 0;
}

/**
 * 発行時の採番を決める。所有者のその暦年に発行済みの件数＋1 を
 * 「YYYY-0001」形式にする。
 */
export async function nextDocumentNumber(db: DbOrTx, issueDate: string): Promise<string> {
  const year = issueDate.slice(0, 4);
  const owner = currentUserId();
  const conditions = [eq(documentsTable.status, "issued"), gte(documentsTable.issueDate, `${year}-01-01`), lte(documentsTable.issueDate, `${year}-12-31`)];
  if (owner !== undefined) conditions.push(eq(documentsTable.ownerUserId, owner));
  const rows = await db.select({ id: documentsTable.id }).from(documentsTable).where(and(...conditions));
  return `${year}-${String(rows.length + 1).padStart(4, "0")}`;
}

/** 帳票行から、明細と修正元番号を引いた完全な API レスポンスを組み立てる。 */
export async function fetchInvoiceResponse(db: Db, row: DocumentRow): Promise<InvoiceResponse> {
  const lines = await listInvoiceLines(db, row.id);
  let correctsDocumentNumber: string | null = null;
  if (row.correctsDocumentId !== null) {
    const source = await getInvoiceRow(db, row.correctsDocumentId);
    correctsDocumentNumber = source?.documentNumber ?? null;
  }
  let settlement: InvoiceSettlement | undefined;
  if (row.status === "issued") {
    const summaries = await settlementSummaries(db, new Map([[row.id, row.totalAmount]]));
    settlement = summaries.get(row.id);
  }
  return invoiceToApi(row, lines, correctsDocumentNumber, settlement);
}

/** 下書きを発行済みにする（採番と発行者スナップショットを凍結する）。 */
export async function markInvoiceIssued(
  db: DbOrTx,
  id: number,
  documentNumber: string,
  issuer: InvoiceIssuer,
): Promise<DocumentRow | null> {
  const updated = await db
    .update(documentsTable)
    .set({
      status: "issued",
      documentNumber,
      issuerSnapshot: issuer,
      updatedAt: new Date(),
    })
    .where(and(invoiceIdCondition(id), eq(documentsTable.status, "draft")))
    .returning();
  return updated[0] ?? null;
}

/**
 * 下書きを採番して発行済みにする。採番（発行済みの件数＋1）は件数を数えて
 * 決めるため、採番から発行までを1トランザクションにし、所有者×年の
 * アドバイザリロックで同時の発行を直列にする（番号の重複を防ぐ）。
 * 下書きでなければ（同時の発行で先に発行済みになった場合も）null。
 */
export async function issueInvoiceRow(
  db: Db,
  id: number,
  issueDate: string,
  issuer: InvoiceIssuer,
): Promise<DocumentRow | null> {
  const lockKey = `invoice-document-number:${currentUserId() ?? "all"}:${issueDate.slice(0, 4)}`;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const documentNumber = await nextDocumentNumber(tx, issueDate);
    return markInvoiceIssued(tx, id, documentNumber, issuer);
  });
}
