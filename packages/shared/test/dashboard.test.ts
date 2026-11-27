/**
 * dashboard.test.ts — ダッシュボードの数値（所得の内訳・青色申告特別控除・
 * 消費税3方式の比較・勘定科目ごとの内訳・年ごとの推移）の検証。
 */
import { describe, expect, test } from "bun:test";
import { categoryBreakdown, dashboardFigures, yearlyIncomeTotals } from "../src/dashboard";
import { filterYear, importCsvText } from "../src/ledger";
import { computeCorrectedFigures } from "../src/taxcalc";
import { sampleTransactions } from "../src/sample";

const csv = (lines: string[]) =>
  importCsvText(["date,description,amount,account,category,income_type", ...lines].join("\n"));

describe("dashboardFigures", () => {
  test("消費税3方式と青色申告特別控除が修正後の申告数値と一致する", () => {
    const tx = filterYear(sampleTransactions(), 2024);
    const figures = dashboardFigures(tx, { filingType: "blue65" });
    const corrected = computeCorrectedFigures(tx, 2024, { filingType: "blue65" });
    expect(figures.consumption.map((row) => [row.method, row.payable])).toEqual([
      ["standard", corrected.consumption_tax_standard],
      ["simplified", corrected.consumption_tax_simplified],
      ["special20", corrected.consumption_tax_special20],
    ]);
    expect(figures.taxableSalesIncl).toBe(corrected.taxable_sales);
    expect(figures.nontaxableSalesIncl).toBe(corrected.nontaxable_sales);
    expect(figures.inputTaxEstimate).toBe(corrected.input_tax_estimate);
    expect(figures.blue.total).toBe(corrected.blue_deduction);
  });
});

describe("categoryBreakdown", () => {
  test("事業分を科目ごとに金額の大きい順で積み、その他区分は含めない", () => {
    const tx = csv([
      "2025-01-10,AWS,-30000,カード,通信費,business",
      "2025-01-11,回線,-10000,カード,通信費,business",
      "2025-01-12,本,-5000,カード,新聞図書費,business",
      "2025-01-13,チャージ,-90000,カード,未分類,other",
      "2025-01-14,報酬,500000,口座,売上高,business",
    ]);
    const expenses = categoryBreakdown(tx, "expense");
    expect(expenses.rows).toEqual([
      { category: "通信費", amount: 40000 },
      { category: "新聞図書費", amount: 5000 },
    ]);
    expect(expenses.total).toBe(45000);
    expect(expenses.slices.map((s) => [s.category, s.colorIndex])).toEqual([
      ["通信費", 5],
      ["新聞図書費", 0],
    ]);
    expect(categoryBreakdown(tx, "income").rows).toEqual([{ category: "売上高", amount: 500000 }]);
  });

  test("7科目以上は上位5科目と「その他」にまとめ、その他は灰色", () => {
    const tx = csv(
      ["A", "B", "C", "D", "E", "F", "G"].map(
        (name, i) => `2025-02-0${i + 1},${name},-${(7 - i) * 1000},カード,科目${name},business`,
      ),
    );
    const { slices } = categoryBreakdown(tx, "expense");
    expect(slices.map((s) => [s.category, s.amount])).toEqual([
      ["科目A", 7000],
      ["科目B", 6000],
      ["科目C", 5000],
      ["科目D", 4000],
      ["科目E", 3000],
      ["その他", 3000],
    ]);
    expect(slices[5]?.colorIndex).toBeNull();
  });
});

describe("yearlyIncomeTotals", () => {
  test("割り当て年度ごとに事業＋不動産の収入・経費・差引を古い順に並べる", () => {
    const totals = yearlyIncomeTotals(sampleTransactions());
    expect(totals.map((t) => t.year)).toEqual([2024, 2025]);
    const [first] = totals;
    expect(first!.balance).toBe(first!.revenue - first!.expenses);
  });
});
