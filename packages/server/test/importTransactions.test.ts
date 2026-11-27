/**
 * importTransactions.test.ts — CSV取込の保存と割り当て年度のリポジトリテスト。
 *
 * Issue #11-1（取込行の fiscalYear 未設定）と #10-2（取込後の年度置換で
 * 既存行が消える／取込行が二重化する）の再現テスト。
 * 取込行に日付の年が入ること、その年度の完全な集合で置き換えても
 * 全行がちょうど1回ずつ残ること、500件超でも欠落しないことを検証する。
 */
import { describe, expect, test } from "bun:test";
import { Transaction } from "@etax/shared";
import { createTestDb } from "./testDb";
import { createImportWithTransactions } from "../src/repositories/importRepository";
import {
  effectiveFiscalYear,
  insertTransactionRow,
  listTransactionRows,
  replaceYearTransactionRows,
} from "../src/repositories/transactionRepository";
import { CsvMapping } from "../src/schemas/importCsv";

const mapping: CsvMapping = {
  dateColumn: "日付",
  descriptionColumn: "摘要",
  amountColumn: "金額",
  debitColumn: null,
  creditColumn: null,
  balanceColumn: null,
  accountColumn: null,
  categoryColumn: null,
  incomeTypeColumn: null,
  taxCategoryColumn: null,
  dateFormat: "YYYY/MM/DD",
  amountSign: "as-is",
};

function importedTx(date: string, description: string, amount: number): Transaction {
  return {
    date,
    year: Number(date.slice(0, 4)),
    description,
    amount,
    account: "事業口座",
    category: "通信費",
    income_type: "business",
    tax_category: "",
  };
}

const existingValues = {
  date: "2026-01-15",
  fiscalYear: 2026,
  description: "手入力の取引",
  amount: -3000,
  account: "事業口座",
  category: "消耗品費",
  incomeType: "business",
  taxCategory: "",
  businessRatioPercent: 100,
  businessRatioBasis: "",
};

describe("CSV取込の保存と割り当て年度", () => {
  test("取り込んだ取引には日付の年が割り当て年度として入る", async () => {
    const db = await createTestDb();
    await createImportWithTransactions(db, {
      filename: "2026.csv",
      sourceName: "テスト銀行",
      mapping,
      transactions: [
        importedTx("2026-03-01", "取込分A", -1000),
        importedTx("2025-12-31", "取込分B", 5000),
      ],
    });
    const rows = await listTransactionRows(db);
    expect(rows.length).toBe(2);
    // スキーマ既定の 0 のままでは年度置換の対象から漏れる
    expect(rows.every((r) => r.fiscalYear !== 0)).toBe(true);
    expect(rows.map((r) => effectiveFiscalYear(r)).sort()).toEqual([2025, 2026]);
  });

  test("既存行がある年度へ取り込んでも、全行がちょうど1回ずつ残る", async () => {
    const db = await createTestDb();
    // その年度に手入力の既存行がある状態から始める
    await insertTransactionRow(db, existingValues);
    await createImportWithTransactions(db, {
      filename: "2026.csv",
      sourceName: "テスト銀行",
      mapping,
      transactions: [
        importedTx("2026-02-01", "取込分A", -1000),
        importedTx("2026-02-02", "取込分B", -2000),
      ],
    });
    // 取込後の完全な集合（既存＋取込）で年度置換しても壊れない
    const full = await listTransactionRows(db);
    expect(full.length).toBe(3);
    await replaceYearTransactionRows(
      db,
      2026,
      full.map((r) => ({
        date: r.date,
        fiscalYear: effectiveFiscalYear(r),
        description: r.description,
        amount: r.amount,
        account: r.account,
        category: r.category,
        incomeType: r.incomeType,
        taxCategory: r.taxCategory,
        businessRatioPercent: r.businessRatioPercent,
        businessRatioBasis: r.businessRatioBasis,
      })),
    );
    const after = await listTransactionRows(db);
    expect(after.length).toBe(3);
    expect(after.map((r) => r.description).sort()).toEqual([
      "取込分A",
      "取込分B",
      "手入力の取引",
    ]);
  });

  test("500件を超える取込でも全件が欠落なく残る", async () => {
    const db = await createTestDb();
    const transactions = Array.from({ length: 600 }, (_, i) =>
      importedTx("2026-04-01", `取込分${i}`, -(i + 1)),
    );
    await createImportWithTransactions(db, {
      filename: "big.csv",
      sourceName: "テスト銀行",
      mapping,
      transactions,
    });
    const rows = await listTransactionRows(db);
    expect(rows.length).toBe(600);
    expect(rows.every((r) => r.fiscalYear === 2026)).toBe(true);
  });
});
