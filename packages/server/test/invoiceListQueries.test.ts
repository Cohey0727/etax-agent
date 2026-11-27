/**
 * invoiceListQueries.test.ts — 請求書一覧の組み立ての検証。
 * 明細・修正元の番号・消込サマリを一覧全体でまとめて引き、件数に比例して
 * クエリが増えないこと、1件ずつ組み立てた結果と同じになることを担保する。
 */
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { Db } from "../src/lib/db";
import {
  InvoiceHeaderDraft,
  InvoiceLineDraft,
  fetchInvoiceResponse,
  fetchInvoiceResponses,
  insertInvoice,
  listInvoiceRows,
  markInvoiceIssued,
} from "../src/repositories/invoiceRepository";
import { emptyTaxpayerProfile } from "../src/repositories/taxpayerRepository";
import { buildIssuerSnapshot } from "../src/services/invoice/validateInvoiceIssue";

const header = (overrides: Partial<InvoiceHeaderDraft> = {}): InvoiceHeaderDraft => ({
  issue_date: "2026-04-01",
  due_date: "2026-04-30",
  counterparty_name: "株式会社サンプル",
  counterparty_address: "",
  is_qualified: false,
  tax_rounding: "floor",
  memo: "",
  ...overrides,
});

const lines: InvoiceLineDraft[] = [
  { item_name: "開発支援業務", quantity: 10, unit: "時間", unit_price: 7000, tax_rate_percent: 10, is_reduced_rate: false },
  { item_name: "食品サンプル", quantity: 2, unit: "個", unit_price: 500, tax_rate_percent: 8, is_reduced_rate: true },
];

/** db.select の呼び出し回数を数えるラッパー（それ以外はそのまま委譲する）。 */
function countingDb(db: Db): { db: Db; selects: () => number } {
  let count = 0;
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "select" && typeof value === "function") {
        return (...args: unknown[]) => {
          count += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { db: proxy, selects: () => count };
}

describe("fetchInvoiceResponses", () => {
  test("件数によらず一定のクエリで組み立て、1件ずつの結果と一致する", async () => {
    const db = await createTestDb();
    const issuer = buildIssuerSnapshot({ ...emptyTaxpayerProfile(), name: "山田太郎" }, false);
    const source = await insertInvoice(db, header(), lines, null);
    if (!source) throw new Error("請求書を作成できませんでした");
    await markInvoiceIssued(db, source.id, "2026-0001", issuer);
    await insertInvoice(db, header({ issue_date: "2026-04-10" }), lines, source.id);
    for (let i = 0; i < 4; i++) {
      await insertInvoice(db, header({ counterparty_name: `取引先${i}` }), lines.slice(0, 1), null);
    }
    const rows = await listInvoiceRows(db, {});
    expect(rows).toHaveLength(6);

    const counted = countingDb(db);
    const batched = await fetchInvoiceResponses(counted.db, rows);
    expect(counted.selects()).toBeLessThanOrEqual(3);

    const oneByOne = [];
    for (const row of rows) oneByOne.push(await fetchInvoiceResponse(db, row));
    expect(batched).toEqual(oneByOne);
    const correction = batched.find((invoice) => invoice.corrects_document_id === source.id);
    expect(correction?.corrects_document_number).toBe("2026-0001");
  });
});
