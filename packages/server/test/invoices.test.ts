/**
 * invoices.test.ts — 請求書（帳票）のリポジトリ・発行バリデーション・PDF生成の検証。
 * テスト用 PostgreSQL で検証する。納税者情報は東京のダミー値を使う。
 */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createTestDb } from "./testDb";
import {
  deleteInvoice,
  fetchInvoiceResponse,
  getInvoiceRow,
  insertInvoice,
  InvoiceHeaderDraft,
  InvoiceLineDraft,
  listInvoiceRows,
  markInvoiceIssued,
  nextDocumentNumber,
  updateInvoice,
} from "../src/repositories/invoiceRepository";
import { upsertTaxpayerProfileRow } from "../src/repositories/taxpayerRepository";
import { emptyTaxpayerProfile } from "../src/repositories/taxpayerRepository";
import { buildInvoicePdf } from "../src/services/pdf/buildInvoicePdf";
import {
  InvoiceDocumentError,
  issueInvoiceDocument,
} from "../src/services/invoice/invoiceDocuments";
import {
  buildIssuerSnapshot,
  validateInvoiceIssue,
} from "../src/services/invoice/validateInvoiceIssue";
import { TaxpayerProfile } from "../src/schemas/taxpayer";

const dummyProfile = (overrides: Partial<TaxpayerProfile> = {}): TaxpayerProfile => ({
  ...emptyTaxpayerProfile(),
  name: "山田太郎",
  shop_name: "山田商店",
  zip_code: "100-0001",
  address: "東京都千代田区千代田1-1",
  invoice_number: "T1234567890123",
  ...overrides,
});

const header = (overrides: Partial<InvoiceHeaderDraft> = {}): InvoiceHeaderDraft => ({
  issue_date: "2026-04-01",
  due_date: "2026-04-30",
  counterparty_name: "株式会社サンプル",
  counterparty_address: "東京都港区芝公園4-2-8",
  is_qualified: true,
  tax_rounding: "floor",
  memo: "",
  ...overrides,
});

const lines: InvoiceLineDraft[] = [
  { item_name: "開発支援業務", quantity: 10, unit: "時間", unit_price: 7000, tax_rate_percent: 10, is_reduced_rate: false },
  { item_name: "食品サンプル", quantity: 2, unit: "個", unit_price: 500, tax_rate_percent: 8, is_reduced_rate: true },
];

describe("請求書リポジトリ", () => {
  test("下書きを作ると税率ごとの集計と税込合計が確定する", async () => {
    const db = await createTestDb();
    const row = await insertInvoice(db, header(), lines, null);
    expect(row).not.toBeNull();
    // 10%: 70,000 → 税 7,000。8%: 1,000 → 税 80。合計 78,080
    expect(row!.totalAmount).toBe(78080);
    const invoice = await fetchInvoiceResponse(db, row!);
    expect(invoice.status).toBe("draft");
    expect(invoice.document_number).toBeNull();
    expect(invoice.totals.groups).toEqual([
      { tax_rate_percent: 10, subtotal: 70000, tax: 7000 },
      { tax_rate_percent: 8, subtotal: 1000, tax: 80 },
    ]);
    expect(invoice.lines[0].amount).toBe(70000);
  });

  test("一覧は交付先・日付・金額・ステータスで絞り込める（発行控えの検索）", async () => {
    const db = await createTestDb();
    await insertInvoice(db, header(), lines, null);
    await insertInvoice(db, header({ counterparty_name: "別会社", issue_date: "2026-05-01" }), lines, null);
    expect((await listInvoiceRows(db, {})).length).toBe(2);
    expect((await listInvoiceRows(db, { q: "サンプル" })).length).toBe(1);
    expect((await listInvoiceRows(db, { from: "2026-04-15" })).length).toBe(1);
    expect((await listInvoiceRows(db, { maxTotal: 1000 })).length).toBe(0);
    expect((await listInvoiceRows(db, { status: "issued" })).length).toBe(0);
  });

  test("発行すると採番され、発行済みは更新・削除できない（不変）", async () => {
    const db = await createTestDb();
    const row = await insertInvoice(db, header(), lines, null);
    const number = await nextDocumentNumber(db, row!.issueDate);
    expect(number).toBe("2026-0001");
    const issuer = buildIssuerSnapshot(dummyProfile(), true);
    const issued = await markInvoiceIssued(db, row!.id, number, issuer);
    expect(issued?.status).toBe("issued");
    expect(issued?.documentNumber).toBe("2026-0001");
    expect((issued?.issuerSnapshot as { invoice_number: string }).invoice_number).toBe("T1234567890123");
    // 不変: 更新・削除は下書き条件で弾かれる
    expect(await updateInvoice(db, row!.id, header({ memo: "改竄" }), lines)).toBeNull();
    expect(await deleteInvoice(db, row!.id)).toBe(false);
    // 次の採番は繰り上がる
    const second = await insertInvoice(db, header(), lines, null);
    expect(await nextDocumentNumber(db, second!.issueDate)).toBe("2026-0002");
  });

  test("修正用下書きは修正元の帳票番号を引いて表示できる", async () => {
    const db = await createTestDb();
    const source = await insertInvoice(db, header(), lines, null);
    await markInvoiceIssued(db, source!.id, "2026-0001", buildIssuerSnapshot(dummyProfile(), true));
    const correction = await insertInvoice(db, header({ issue_date: "2026-04-10" }), lines, source!.id);
    const invoice = await fetchInvoiceResponse(db, correction!);
    expect(invoice.corrects_document_id).toBe(source!.id);
    expect(invoice.corrects_document_number).toBe("2026-0001");
    expect(invoice.status).toBe("draft");
  });
});

describe("請求書の発行（採番）", () => {
  test("下書きを同時に発行しても帳票番号は重複せず、連番になる", async () => {
    const db = await createTestDb();
    const drafts = await Promise.all(
      Array.from({ length: 10 }, () => insertInvoice(db, header({ is_qualified: false }), lines, null)),
    );
    const issued = await Promise.all(drafts.map((draft) => issueInvoiceDocument(db, draft!.id)));
    const numbers = issued.map((invoice) => invoice.document_number ?? "").sort();
    expect(numbers).toEqual(
      Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(4, "0")}`),
    );
  });

  test("同じ下書きを同時に発行しても1回だけ発行され、番号を消費しない", async () => {
    const db = await createTestDb();
    const draft = await insertInvoice(db, header({ is_qualified: false }), lines, null);
    const results = await Promise.allSettled([
      issueInvoiceDocument(db, draft!.id),
      issueInvoiceDocument(db, draft!.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(InvoiceDocumentError);
    const next = await insertInvoice(db, header({ is_qualified: false }), lines, null);
    expect((await issueInvoiceDocument(db, next!.id)).document_number).toBe("2026-0002");
  });
});

describe("発行バリデーション（適格請求書の記載事項）", () => {
  const target = {
    is_qualified: true,
    counterparty_name: "株式会社サンプル",
    issue_date: "2026-04-01",
    lines: [{ item_name: "開発支援業務", tax_rate_percent: 10, is_reduced_rate: false }],
  };

  test("登録番号が未設定なら適格請求書として発行できない（自動生成はしない）", async () => {
    const db = await createTestDb();
    await upsertTaxpayerProfileRow(db, 2026, dummyProfile({ invoice_number: "" }));
    const problems = validateInvoiceIssue(target, dummyProfile({ invoice_number: "" }));
    expect(problems.some((p) => p.includes("登録番号"))).toBe(true);
  });

  test("登録番号の形式が違うと発行できない", () => {
    const problems = validateInvoiceIssue(target, dummyProfile({ invoice_number: "12345" }));
    expect(problems.some((p) => p.includes("形式"))).toBe(true);
  });

  test("8%の明細は軽減対象の明示がないと発行できない", () => {
    const reduced = {
      ...target,
      lines: [{ item_name: "食品", tax_rate_percent: 8, is_reduced_rate: false }],
    };
    expect(validateInvoiceIssue(reduced, dummyProfile()).length).toBeGreaterThan(0);
    const marked = {
      ...target,
      lines: [{ item_name: "食品", tax_rate_percent: 8, is_reduced_rate: true }],
    };
    expect(validateInvoiceIssue(marked, dummyProfile())).toEqual([]);
  });

  test("軽減税率の印は8%の明細にだけ付けられる", () => {
    for (const rate of [10, 0]) {
      const marked = {
        ...target,
        lines: [{ item_name: "開発", tax_rate_percent: rate, is_reduced_rate: true }],
      };
      expect(validateInvoiceIssue(marked, dummyProfile()).some((p) => p.includes("軽減"))).toBe(true);
    }
  });

  test("税率は 10%・8%・対象外（0%）以外では発行できない", () => {
    const odd = {
      ...target,
      lines: [{ item_name: "開発", tax_rate_percent: 5, is_reduced_rate: false }],
    };
    expect(validateInvoiceIssue(odd, dummyProfile()).some((p) => p.includes("税率"))).toBe(true);
    const exempt = {
      ...target,
      lines: [{ item_name: "立替金", tax_rate_percent: 0, is_reduced_rate: false }],
    };
    expect(validateInvoiceIssue(exempt, dummyProfile())).toEqual([]);
  });

  test("適格でない請求書は登録番号がなくても発行できる", () => {
    const problems = validateInvoiceIssue(
      { ...target, is_qualified: false },
      dummyProfile({ invoice_number: "" }),
    );
    expect(problems).toEqual([]);
  });

  test("交付先・品目の欠落は適格でなくても発行できない", () => {
    const problems = validateInvoiceIssue(
      { ...target, is_qualified: false, counterparty_name: " ", lines: [] },
      dummyProfile(),
    );
    expect(problems.length).toBe(2);
  });
});

describe("請求書PDF", () => {
  test("発行済み帳票からPDFを生成できる", async () => {
    const fontPaths = [
      process.env.ETAX_FONT_PATH ?? "",
      `${process.env.HOME ?? ""}/workspace/fonts/NotoSansJP.ttf`,
      "/tmp/forms/ipa/ipaexg00401/ipaexg.ttf",
    ].filter((path) => path !== "");
    let fontBytes: Uint8Array | null = null;
    for (const path of fontPaths) {
      try {
        fontBytes = new Uint8Array(await readFile(path));
        break;
      } catch {
        // 次の候補へ
      }
    }
    if (!fontBytes) return; // フォントの無い環境ではスキップ
    const db = await createTestDb();
    const row = await insertInvoice(db, header(), lines, null);
    await markInvoiceIssued(db, row!.id, "2026-0001", buildIssuerSnapshot(dummyProfile(), true));
    const issuedRow = await getInvoiceRow(db, row!.id);
    const invoice = await fetchInvoiceResponse(db, issuedRow!);
    const pdf = await buildInvoicePdf(invoice, fontBytes);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });
});
