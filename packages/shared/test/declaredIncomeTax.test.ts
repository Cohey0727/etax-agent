import { describe, expect, test } from "bun:test";
import { computeFilingFigures, declaredIncomeTaxOf, freshDeductionState } from "../src/filingInputs";
import type { Transaction } from "../src/types";

const sale = (amount: number): Transaction => ({
  date: "2025-05-01",
  year: 2025,
  description: "売上",
  amount,
  account: "事業口座",
  category: "売上高",
  income_type: "business",
  tax_category: "",
});

describe("申告納税額と第3期分", () => {
  const base = { ...freshDeductionState(), filingType: "white" as const };

  test("源泉徴収税額を引いてから100円未満を切り捨て、予定納税額を引いた残りが第3期分", () => {
    const figures = computeFilingFigures([sale(5_000_000)], 2025, base);
    const t = figures.taxResult;
    const raw = t.incomeTaxAfterForeignCredit + t.reconstructionTax - 10_050;
    expect(declaredIncomeTaxOf(figures, { withholdingTax: 10_050, prepaidTax: 50_000 })).toEqual({
      declaredTax: Math.floor(raw / 100) * 100,
      thirdPeriodTax: Math.floor(raw / 100) * 100 - 50_000,
    });
  });

  test("源泉徴収税額が多ければ申告納税額は負（還付）のまま切り捨てない", () => {
    const figures = computeFilingFigures([sale(1_500_000)], 2025, base);
    const t = figures.taxResult;
    const declared = declaredIncomeTaxOf(figures, { withholdingTax: 1_000_000, prepaidTax: 0 });
    expect(declared.declaredTax).toBe(t.incomeTaxAfterForeignCredit + t.reconstructionTax - 1_000_000);
    expect(declared.declaredTax).toBeLessThan(0);
  });

  test("外国税額控除があっても、基準所得税額から一度だけ引いた額で精算する", () => {
    const figures = computeFilingFigures([sale(9_000_000)], 2025, {
      ...base,
      taxCredits: { ...base.taxCredits, foreignTaxPaid: 50_000, foreignIncome: 1_000_000 },
    });
    const t = figures.taxResult;
    expect(t.taxCredits.foreignTax).toBeGreaterThan(0);
    const declared = declaredIncomeTaxOf(figures, { withholdingTax: 0, prepaidTax: 0 });
    // 源泉徴収税額が 0 なら申告納税額は確定税額と同じ
    expect(declared.declaredTax).toBe(t.finalTax);
  });

  test("配当・株式等譲渡の入力の源泉徴収税額も精算に含める", () => {
    const withDividend = {
      ...base,
      expandedIncome: {
        ...base.expandedIncome,
        dividend: { ...base.expandedIncome.dividend, listedRevenue: 100_000, listedWithholding: 15_315 },
      },
    };
    const figures = computeFilingFigures([sale(5_000_000)], 2025, withDividend);
    const t = figures.taxResult;
    const raw = t.incomeTaxAfterForeignCredit + t.reconstructionTax - 10_000 - 15_315;
    expect(declaredIncomeTaxOf(figures, { withholdingTax: 10_000, prepaidTax: 0 }).declaredTax).toBe(
      Math.floor(raw / 100) * 100,
    );
  });
});
