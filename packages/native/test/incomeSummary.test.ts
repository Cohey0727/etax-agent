import { describe, expect, test } from "bun:test";
import {
  EMPTY_AGRICULTURE_INPUT,
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  Transaction,
  computeCorrectedFigures,
  computeManualIncomes,
  normalizeAgricultureInput,
} from "@etax/shared";
import { summarizeIncome } from "../src/features/filing/incomeSummaryFigures";

const year = 2025;

function tx(amount: number, category: string, income_type: Transaction["income_type"]): Transaction {
  return { date: "2025-03-01", description: category, amount, account: "", category, income_type, year } as Transaction;
}

function sum(rows: readonly { amount: number }[]): number {
  return rows.reduce((total, row) => total + row.amount, 0);
}

describe("所得の要約", () => {
  test("農業所得の入力を含めて、税額計算と同じ所得合計・青色申告特別控除にする", () => {
    // 事業的規模でない不動産だけの帳簿でも、農業所得があれば控除の上限は65万円
    const transactions = [tx(1_200_000, "家賃収入", "real_estate"), tx(-200_000, "修繕費", "real_estate")];
    const agriculture = normalizeAgricultureInput({
      ...EMPTY_AGRICULTURE_INPUT,
      salesAmount: 3_000_000,
      expenseTotals: { 肥料費: 1_000_000 },
    });
    const figures = computeCorrectedFigures(transactions, year, { filingType: "blue65", agriculture });
    const manual = computeManualIncomes(
      year,
      EMPTY_SALARY_INCOME,
      EMPTY_MISC_INCOME,
      figures._detail.business_income + figures._detail.real_estate_income + figures._detail.agriculture_income,
    );
    const summary = summarizeIncome(figures, manual, 0, "blue65");
    expect(summary.totalIncome).toBe(2_350_000);
    expect(summary.bridgeRows.find((r) => r.label === "青色申告特別控除")?.amount).toBe(-650_000);
    expect(sum(summary.bridgeRows)).toBe(summary.totalIncome);
  });

  test("雑所得の赤字の行も出し、内訳の合計を所得合計と一致させる", () => {
    const figures = computeCorrectedFigures([tx(3_000_000, "売上高", "business")], year, { filingType: "white" });
    const manual = computeManualIncomes(
      year,
      EMPTY_SALARY_INCOME,
      { ...EMPTY_MISC_INCOME, businessIncome: -500_000, income: 800_000 },
      figures._detail.business_income,
    );
    const summary = summarizeIncome(figures, manual, 0, "white");
    expect(summary.bridgeRows.find((r) => r.label === "雑所得（業務）")?.amount).toBe(-500_000);
    expect(summary.bridgeRows.find((r) => r.label === "雑所得（その他）")?.amount).toBe(800_000);
    expect(sum(summary.bridgeRows)).toBe(summary.totalIncome);
  });

  test("配当・一時所得の総合課税分も所得合計と内訳に含める", () => {
    const figures = computeCorrectedFigures([tx(1_000_000, "売上高", "business")], year, { filingType: "white" });
    const manual = computeManualIncomes(year, EMPTY_SALARY_INCOME, EMPTY_MISC_INCOME, 1_000_000);
    const summary = summarizeIncome(figures, manual, 250_000, "white");
    expect(summary.totalIncome).toBe(1_250_000);
    expect(sum(summary.bridgeRows)).toBe(1_250_000);
  });
});
