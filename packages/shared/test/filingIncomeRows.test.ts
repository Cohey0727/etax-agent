/**
 * filingIncomeRows.test.ts — 総合・収支タブの所得の要約（web・native 共通）の検証。
 *
 * 担保すること:
 * - 所得合計は所得税額の計算と同じ合計所得（農業所得・配当・一時所得を含む）
 * - 内訳の行を足すと所得合計になる（雑所得の赤字の行も消さない）
 */
import { describe, expect, test } from "bun:test";
import {
  computeFilingFigures,
  filingIncomeBridgeRows as incomeBridgeRows,
  filingIncomeStatCards as incomeStatCards,
  freshDeductionState,
} from "../src/filingInputs";
import type { Transaction } from "../src/types";

const tx = (date: string, amount: number, category: string, income_type: Transaction["income_type"]): Transaction => ({
  date,
  year: 2025,
  description: category,
  amount,
  account: "事業口座",
  category,
  income_type,
  tax_category: "",
});

const base = freshDeductionState();

describe("filingIncomeBridgeRows / filingIncomeStatCards", () => {
  test("農業所得と一時所得のある年: 所得合計は税額計算と同じで、内訳の合計とも一致する", () => {
    const figures = computeFilingFigures(
      [tx("2025-03-01", 2_000_000, "家賃収入", "real_estate"), tx("2025-03-10", -500_000, "修繕費", "real_estate")],
      2025,
      {
        ...base,
        agriculture: { ...base.agriculture, salesAmount: 3_000_000, expenseTotals: { 肥料費: 1_000_000 } },
        expandedIncome: { ...base.expandedIncome, temp: { revenue: 1_500_000, expenses: 0 } },
      },
    );
    const cards = incomeStatCards(figures, false);
    expect(cards[3]).toEqual({ label: "所得合計（青色控除後）", amount: figures.taxResult.totalIncome });
    const rows = incomeBridgeRows(figures, false);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(figures.totalIncome);
    expect(rows.map((row) => row.label)).toContain("農業所得（青色申告特別控除前）");
    expect(rows.map((row) => row.label)).toContain("一時所得（2分の1）");
  });

  test("雑所得（業務）の赤字も行に出し、通算しない分を戻して内訳の合計と所得合計が合う", () => {
    const figures = computeFilingFigures(
      [tx("2025-04-01", 5_000_000, "売上高", "business"), tx("2025-04-02", -1_000_000, "外注費", "business")],
      2025,
      { ...base, miscIncome: { ...base.miscIncome, businessIncome: -300_000 } },
    );
    const rows = incomeBridgeRows(figures, false);
    expect(rows).toContainEqual({ label: "雑所得（業務）", amount: -300_000 });
    expect(rows).toContainEqual({ label: "雑所得の赤字のうち他の所得と通算しない額", amount: 300_000 });
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(figures.totalIncome);
    // 雑所得の赤字は事業所得と損益通算しない（所得税法69条1項）
    expect(figures.totalIncome).toBe(3_350_000);
  });

  test("事業の赤字と一時所得があるとき、通算してから1/2にした額で内訳の合計と所得合計が合う", () => {
    const figures = computeFilingFigures(
      [tx("2025-04-01", 1_000_000, "売上高", "business"), tx("2025-04-02", -2_000_000, "外注費", "business")],
      2025,
      {
        ...base,
        filingType: "white",
        expandedIncome: { ...base.expandedIncome, temp: { revenue: 2_000_000, expenses: 0 } },
      },
    );
    const rows = incomeBridgeRows(figures, true);
    expect(rows).toContainEqual({ label: "一時所得の金額（特別控除後）", amount: 1_500_000 });
    expect(rows).toContainEqual({ label: "一時所得のうち総所得金額に算入しない額", amount: -250_000 });
    expect(figures.totalIncome).toBe(250_000);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(250_000);
  });

  test("帳簿に取引が無い年（給与だけ）でも所得合計を出す", () => {
    const figures = computeFilingFigures([], 2025, {
      ...base,
      salaryIncome: { revenue: 5_000_000, adjustmentEligible: false },
    });
    const rows = incomeBridgeRows(figures, true);
    expect(rows.find((row) => row.label === "給与所得")?.amount).toBe(figures.manual.salary);
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(figures.totalIncome);
    expect(incomeStatCards(figures, true)[3]?.label).toBe("所得合計");
  });
});
