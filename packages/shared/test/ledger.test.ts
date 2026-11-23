/**
 * ledger.test.ts — 取引の割り当て年度（year）の検証。
 * year は日付から機械的に決まるものではなく「計上する年」。
 * 既定は日付の年だが、日付と違う年へ割り当てた取引は
 * filterYear・正規化のどちらでも割り当て年度で扱われる。
 */
import { describe, expect, test } from "bun:test";
import { filterYear, normalizeTransaction, normalizeTransactions } from "../src/index";

const base = {
  description: "カード利用",
  amount: -12000,
  account: "カード",
  category: "消耗品費",
  income_type: "business",
  tax_category: "課対仕入10%",
};

describe("割り当て年度", () => {
  test("normalizeTransaction は日付と違う year を保持する", () => {
    const tx = normalizeTransaction({ ...base, date: "2024-12-31", year: 2025 });
    expect(tx.date).toBe("2024-12-31");
    expect(tx.year).toBe(2025);
  });

  test("year が無い場合は日付の年になる", () => {
    const tx = normalizeTransaction({ ...base, date: "2024-12-31" });
    expect(tx.year).toBe(2024);
  });

  test("filterYear は割り当て年度で絞る（日付の年ではない）", () => {
    const txs = normalizeTransactions([
      { ...base, date: "2024-12-31", year: 2025 },
      { ...base, date: "2025-01-05", year: 2025 },
      { ...base, date: "2025-03-01", year: 2024 },
    ]);
    expect(filterYear(txs, 2025)).toHaveLength(2);
    expect(filterYear(txs, 2024)).toHaveLength(1);
    expect(filterYear(txs, 2024)[0]?.date).toBe("2025-03-01");
  });
});
