/**
 * ledgerPdf.test.ts — 帳簿・請求書 PDF の表の行の検証。
 * 摘要や品目に改行が含まれても（CSV の引用符付きセルなど）、1行の欄に
 * 1行で描き、下の行に重ならないことを担保する。
 * 日本語フォントはサーバーのデータフォルダから読み、無い環境では省略する。
 */
import { describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { buildInvoicePdf } from "../src/services/pdf/buildInvoicePdf";
import { buildLedgerPdf } from "../src/services/pdf/buildLedgerPdf";
import { loadJapaneseFont } from "../src/services/pdf/loadJapaneseFont";
import { InvoiceResponse } from "../src/schemas/invoice";
import { TransactionResponse } from "../src/schemas/transaction";

/** PDF のコンテンツストリームを展開し、2行以上を描いたテキストブロック（BT〜ET）の数を数える。 */
function countMultiLineTexts(pdf: Uint8Array): number {
  const raw = Buffer.from(pdf).toString("latin1");
  let count = 0;
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1] ?? "", "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const block of content.split("BT").slice(1)) {
      const text = block.split("ET")[0] ?? "";
      if ((text.match(/\bTj\b/g) ?? []).length > 1) count++;
    }
  }
  return count;
}

const transaction = (overrides: Partial<TransactionResponse>): TransactionResponse => ({
  id: 1,
  date: "2025-01-05",
  fiscal_year: 2025,
  description: "",
  amount: 0,
  account: "普通預金",
  category: "売上高",
  income_type: "business",
  tax_category: "",
  business_ratio_percent: 100,
  business_ratio_basis: "",
  import_id: null,
  created_at: "2025-01-05T00:00:00.000Z",
  updated_at: "2025-01-05T00:00:00.000Z",
  deleted_at: null,
  ...overrides,
});

describe("表の行は1行で描く", () => {
  test("帳簿: 改行を含む摘要を1行で描く", async () => {
    const font = await loadJapaneseFont();
    if (!font) return;
    const pdf = await buildLedgerPdf(
      [
        transaction({ id: 1, description: "振込 カ）テスト\n請求書No.123 1月分", amount: 300000 }),
        transaction({ id: 2, date: "2025-01-06", description: "AWS\r\n利用料", amount: -5000, category: "通信費" }),
      ],
      2025,
      new Date("2025-02-01T00:00:00Z"),
      font,
    );
    expect(countMultiLineTexts(pdf)).toBe(0);
  });

  test("請求書: 改行を含む品目・交付先を1行で描く", async () => {
    const font = await loadJapaneseFont();
    if (!font) return;
    const invoice: InvoiceResponse = {
      id: 1,
      kind: "invoice",
      status: "issued",
      document_number: "2026-0001",
      issue_date: "2026-04-01",
      due_date: "2026-04-30",
      counterparty_name: "株式会社サンプル\n経理部",
      counterparty_address: "東京都港区芝公園4-2-8",
      is_qualified: true,
      tax_rounding: "floor",
      memo: "",
      corrects_document_id: null,
      corrects_document_number: null,
      issuer: {
        name: "山田商店",
        zip_code: "100-0001",
        address: "東京都千代田区千代田1-1",
        invoice_number: "T1234567890123",
      },
      lines: [
        {
          id: 1,
          item_name: "開発支援業務\n（4月分）",
          quantity: 1,
          unit: "式",
          unit_price: 100000,
          tax_rate_percent: 10,
          is_reduced_rate: false,
          amount: 100000,
        },
      ],
      totals: {
        groups: [{ tax_rate_percent: 10, subtotal: 100000, tax: 10000 }],
        subtotal: 100000,
        tax_total: 10000,
        total: 110000,
      },
      payment_status: "unpaid",
      settled_amount: 0,
      remaining_amount: 110000,
      created_at: "2026-04-01T00:00:00.000Z",
    };
    const pdf = await buildInvoicePdf(invoice, font);
    expect(countMultiLineTexts(pdf)).toBe(0);
  });
});
