/**
 * returnFormValues.test.ts — 申告書第一表の「税金の計算」欄の値の検証。
 * 欄どうしの計算（所得税及び復興特別所得税の額 − 外国税額控除等 − 源泉
 * 徴収税額 = 申告納税額）が、計算エンジンの確定税額と一致することと、
 * 手引きの記載方法（赤字の申告納税額は△付きでそのまま）を担保する。
 */
import { describe, expect, test } from "bun:test";
import {
  computeCorrectedFigures,
  computeIncomeTax,
  computeManualIncomes,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  EMPTY_XTX_TAXPAYER,
  IncomeTaxResult,
  TaxCreditInputs,
  Transaction,
} from "@etax/shared";
import { buildReturnFormValues, ReturnFormValues } from "../src/services/pdf/returnFormValues";

const YEAR = 2025;

function businessTransactions(revenue: number, expenses: number): Transaction[] {
  const base = { year: YEAR, account: "普通預金", income_type: "business", tax_category: "" };
  return [
    { ...base, date: `${YEAR}-03-01`, description: "売上", amount: revenue, category: "売上高" },
    { ...base, date: `${YEAR}-03-02`, description: "通信費", amount: -expenses, category: "通信費" },
  ];
}

function formValues(options: {
  credits?: Partial<TaxCreditInputs>;
  withholding?: number;
  separateStockIncome?: number;
}): { values: ReturnFormValues; tax: IncomeTaxResult } {
  const figures = computeCorrectedFigures(businessTransactions(12_000_000, 2_000_000), YEAR, {});
  const manual = computeManualIncomes(YEAR, { revenue: 0 }, EMPTY_MISC_INCOME, figures._detail.business_income);
  const tax = computeIncomeTax({
    year: YEAR,
    totalIncome: figures._detail.business_income + manual.total,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, ...options.credits },
    separateTaxation: options.separateStockIncome
      ? { stockIncome: options.separateStockIncome, dividendIncome: 0 }
      : undefined,
  });
  const values = buildReturnFormValues({
    year: YEAR,
    amendment: false,
    submissionDate: "2026-03-01",
    taxpayer: EMPTY_XTX_TAXPAYER,
    figures,
    tax,
    miscIncome: EMPTY_MISC_INCOME,
    salaryIncome: { revenue: 0 },
    manual,
    deductionInputs: EMPTY_DEDUCTION_INPUTS,
    withholdingTax: options.withholding ?? 0,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
  });
  return { values, tax };
}

describe("buildReturnFormValues の税金の計算", () => {
  test("外国税額控除が所得税分だけでも、源泉0なら申告納税額は確定税額と一致する", () => {
    const { values, tax } = formValues({
      credits: { foreignTaxPaid: 200_000, foreignIncome: 3_000_000 },
    });
    expect(tax.taxCredits.foreignTaxReconstructionPart).toBe(0);
    expect(values.amounts.declaredTax).toBe(tax.finalTax);
  });

  test("外国税額控除が復興特別所得税にかかっても、源泉0なら申告納税額は確定税額と一致する", () => {
    const { values, tax } = formValues({
      credits: { foreignTaxPaid: 600_000, foreignIncome: 3_000_000 },
    });
    expect(tax.taxCredits.foreignTaxReconstructionPart).toBeGreaterThan(0);
    expect(values.amounts.declaredTax).toBe(tax.finalTax);
    // 欄どうしの計算: 基準所得税額 + 復興特別所得税額 = 計、計 − 外国税額控除等 = 申告納税額（切捨て前）
    const a = values.amounts;
    expect((a.taxAfterCredits2 ?? 0) + (a.taxReconstruction ?? 0)).toBe(a.taxTotal ?? 0);
    expect(a.creditForeign).toBe(tax.taxCredits.foreignTax);
    expect(Math.floor(((a.taxTotal ?? 0) - (a.creditForeign ?? 0)) / 100) * 100).toBe(a.declaredTax ?? 0);
  });

  test("還付になる場合、申告納税額は切り捨てずに負数のまま、還付される税金と対応する", () => {
    const { values } = formValues({ withholding: 2_000_000 });
    const a = values.amounts;
    const raw = (a.taxTotal ?? 0) - 2_000_000;
    expect(raw).toBeLessThan(0);
    expect(a.declaredTax).toBe(raw);
    expect(a.thirdRefund).toBe(-raw);
    expect(a.thirdPay).toBeUndefined();
    expect(a.dueByDeadline).toBe(0);
  });

  test("申告分離課税の所得がある場合、課税される所得金額は分離課税分を合算する", () => {
    const { values, tax } = formValues({ separateStockIncome: 1_000_000 });
    expect(tax.taxableSeparateStocks).toBeGreaterThan(0);
    expect(values.amounts.taxTaxable).toBe(
      tax.taxableIncome + tax.taxableSeparateStocks + tax.taxableSeparateDividends,
    );
  });
});
