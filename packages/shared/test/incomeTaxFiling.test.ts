/**
 * incomeTaxFiling.test.ts — 帳簿と申告入力から所得税額を求める配線の検証。
 * 合計所得金額は経常所得と一時所得を損益通算してから一時所得を1/2にする
 * （所得税法22条2項2号・同法施行令198条）。
 */
import { describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_EXPANDED_INCOME,
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  ExpandedIncomeInput,
  Transaction,
  computeComprehensiveIncomeTax,
  computeExpandedIncomes,
  computeIncomeTaxFiling,
} from "../src";

function tx(category: string, amount: number): Transaction {
  return {
    date: "2025-06-15",
    year: 2025,
    description: category,
    amount,
    account: "普通預金",
    category,
    income_type: "business",
    tax_category: "",
  };
}

/** 一時所得の金額（特別控除50万円の後）が 1,500,000 になる入力 */
const TEMP_1_5M: ExpandedIncomeInput = {
  ...EMPTY_EXPANDED_INCOME,
  temp: { revenue: 2_000_000, expenses: 0 },
};

function filing(transactions: Transaction[], expandedIncome?: ExpandedIncomeInput) {
  return computeIncomeTaxFiling({
    year: 2025,
    transactions,
    salaryIncome: EMPTY_SALARY_INCOME,
    miscIncome: EMPTY_MISC_INCOME,
    expandedIncome,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: EMPTY_TAX_CREDIT_INPUTS,
  });
}

describe("computeIncomeTaxFiling", () => {
  test("事業の損失は一時所得と通算してから、一時所得を1/2にする", () => {
    // 事業所得 −1,000,000・一時所得の金額 1,500,000 → (1,500,000 − 1,000,000) × 1/2
    const result = filing([tx("売上高", 500_000), tx("外注費", -1_500_000)], TEMP_1_5M);
    expect(result.figures._detail.business_income).toBe(-1_000_000);
    expect(result.expanded?.temp.amount).toBe(1_500_000);
    expect(result.tax.totalIncome).toBe(250_000);
  });

  test("拡張所得が無ければ、帳簿の所得と給与・雑所得の合計", () => {
    const result = computeIncomeTaxFiling({
      year: 2025,
      transactions: [tx("売上高", 3_000_000)],
      salaryIncome: EMPTY_SALARY_INCOME,
      miscIncome: { ...EMPTY_MISC_INCOME, revenue: 300_000, income: 200_000 },
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    // 事業 3,000,000 − 青色申告特別控除 650,000 + 雑所得 200,000
    expect(result.tax.totalIncome).toBe(2_550_000);
    expect(result.expanded).toBeUndefined();
    expect(result.expandedWithholding).toBe(0);
  });
});

describe("computeComprehensiveIncomeTax", () => {
  test("黒字の経常所得には一時所得の1/2を足す", () => {
    const expanded = computeExpandedIncomes(TEMP_1_5M);
    const result = computeComprehensiveIncomeTax({
      year: 2025,
      ordinaryIncome: 3_000_000,
      expanded,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(result.totalIncome).toBe(3_750_000);
  });

  test("配当所得の赤字は経常所得と通算しない", () => {
    const expanded = computeExpandedIncomes({
      ...EMPTY_EXPANDED_INCOME,
      dividend: {
        ...EMPTY_EXPANDED_INCOME.dividend,
        generalRevenue: 100_000,
        interestExpense: 400_000,
        listedMode: "comprehensive",
      },
    });
    expect(expanded.dividend.comprehensiveIncome).toBeLessThan(0);
    const result = computeComprehensiveIncomeTax({
      year: 2025,
      ordinaryIncome: 3_000_000,
      expanded,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(result.totalIncome).toBe(3_000_000);
  });
});
