/**
 * ledgerCsv.test.ts — 帳簿の CSV 書き出しと収入区分の表示名の検証。
 */
import { describe, expect, test } from "bun:test";
import { buildLedgerCsv, LedgerCsvRow, ledgerIncomeTypeLabel } from "../src/ledgerCsv";

const row = (partial: Partial<LedgerCsvRow>): LedgerCsvRow => ({
  date: "2025-04-01",
  fiscal_year: 2025,
  description: "サーバー利用料",
  amount: -1200,
  category: "通信費",
  income_type: "business",
  tax_category: "課税仕入10%",
  account: "カード",
  ...partial,
});

const lines = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

describe("buildLedgerCsv", () => {
  test("BOM と見出しを付け、区分は表示名で書く", () => {
    const csv = buildLedgerCsv([row({})]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines(csv)).toEqual([
      "日付,年度,摘要,金額,勘定科目,区分,税区分,出所",
      "2025-04-01,2025,サーバー利用料,-1200,通信費,事業,課税仕入10%,カード",
    ]);
  });

  test("カンマ・引用符・改行を含むセルは引用する", () => {
    const csv = buildLedgerCsv([row({ description: 'A,"B"\nC' })]);
    expect(csv).toContain('"A,""B""\nC"');
  });
});

describe("ledgerIncomeTypeLabel", () => {
  test("その他区分は対象外、未知の値はそのまま", () => {
    expect(ledgerIncomeTypeLabel("other")).toBe("対象外");
    expect(ledgerIncomeTypeLabel("agriculture")).toBe("agriculture");
  });
});
