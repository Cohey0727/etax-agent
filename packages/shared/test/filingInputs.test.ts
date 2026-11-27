/**
 * filingInputs.test.ts — 申告入力（DeductionState）の空の状態・保存値の復元・
 * 部分パッチ・確定スナップショット・基準期間の課税売上高の検証。
 */
import { describe, expect, test } from "bun:test";
import {
  applyBreakdownEntries,
  applyDeductionPatch,
  buildSnapshotFigures,
  deriveBasePeriodSalesThousands,
  freshDeductionState,
  parseDeductionState,
  specialRelativeInputApplies,
} from "../src/filingInputs";
import { computeIncomeTax, EMPTY_DEDUCTION_INPUTS, EMPTY_TAX_CREDIT_INPUTS } from "../src/deductions";
import type { Transaction } from "../src/types";

const tx = (date: string, amount: number, category: string, extra: Partial<Transaction> = {}): Transaction => ({
  date,
  year: Number(date.slice(0, 4)),
  description: category,
  amount,
  account: "事業口座",
  category,
  income_type: "business",
  tax_category: "",
  ...extra,
});

describe("freshDeductionState", () => {
  test("源泉徴収税額・予定納税額と消費税の手入力は空の値で始まる", () => {
    const state = freshDeductionState();
    expect(state.incomeTaxPayments).toEqual({ withholdingTax: 0, prepaidTax: 0 });
    expect(state.consumptionFiling).toEqual({
      filingKind: 1,
      basePeriodSalesThousands: null,
      interimNational: 0,
      interimLocal: 0,
      originalNational: 0,
      originalLocal: 0,
    });
  });

  test("呼ぶたびに別のオブジェクトを返す（空の定数を共有しない）", () => {
    const a = freshDeductionState();
    const b = freshDeductionState();
    a.incomeTaxPayments.withholdingTax = 1;
    a.consumptionFiling.interimNational = 1;
    a.deductions.dependents.general = 1;
    expect(b.incomeTaxPayments.withholdingTax).toBe(0);
    expect(b.consumptionFiling.interimNational).toBe(0);
    expect(b.deductions.dependents.general).toBe(0);
  });
});

describe("parseDeductionState", () => {
  test("新しい項目の無い保存値は空の値で補う", () => {
    const state = parseDeductionState({ filingType: "blue55" });
    expect(state.filingType).toBe("blue55");
    expect(state.incomeTaxPayments).toEqual({ withholdingTax: 0, prepaidTax: 0 });
    expect(state.consumptionFiling.filingKind).toBe(1);
    expect(state.consumptionFiling.basePeriodSalesThousands).toBeNull();
  });

  test("保存した源泉徴収税額・予定納税額と消費税の手入力を復元する", () => {
    const saved = {
      incomeTaxPayments: { withholdingTax: 300_000, prepaidTax: 50_000 },
      consumptionFiling: {
        filingKind: 3 as const,
        basePeriodSalesThousands: 12_345,
        interimNational: 100_000,
        interimLocal: 28_200,
        originalNational: 400_000,
        originalLocal: 112_800,
      },
    };
    const state = parseDeductionState(JSON.parse(JSON.stringify(saved)));
    expect(state.incomeTaxPayments).toEqual(saved.incomeTaxPayments);
    expect(state.consumptionFiling).toEqual(saved.consumptionFiling);
  });

  test("壊れた値は0・確定・帳簿から求める（null）に寄せ、端数は切り捨てる", () => {
    const broken = {
      incomeTaxPayments: { withholdingTax: "300000", prepaidTax: 1234.9 },
      consumptionFiling: {
        filingKind: 2,
        basePeriodSalesThousands: "abc",
        interimNational: Number.NaN,
        interimLocal: null,
        originalNational: 10.7,
      },
    } as unknown as Parameters<typeof parseDeductionState>[0];
    const state = parseDeductionState(broken);
    expect(state.incomeTaxPayments).toEqual({ withholdingTax: 0, prepaidTax: 1234 });
    expect(state.consumptionFiling).toEqual({
      filingKind: 1,
      basePeriodSalesThousands: null,
      interimNational: 0,
      interimLocal: 0,
      originalNational: 10,
      originalLocal: 0,
    });
  });

  test("既存の項目の検証（配偶者の区分・申告の種類・内訳）はそのまま", () => {
    const state = parseDeductionState({
      deductions: { ...EMPTY_DEDUCTION_INPUTS, spouseCategory: "unknown" as never },
      filingType: "blue99" as never,
      donationEntries: [{ id: "", recipient: 1, amount: 1000.5 }, null] as never,
    });
    expect(state.deductions.spouseCategory).toBe("none");
    expect(state.filingType).toBe("blue65");
    expect(state.donationEntries).toEqual([{ id: "breakdown-loaded-0", recipient: "", amount: 1000 }]);
  });
});

describe("applyBreakdownEntries / applyDeductionPatch", () => {
  test("内訳の合計が対応する控除の金額へ入る", () => {
    const next = applyBreakdownEntries(freshDeductionState(), "medical", [
      { id: "a", recipient: "病院", amount: 120_000 },
      { id: "b", recipient: "薬局", amount: 30_000 },
    ]);
    expect(next.medicalEntries).toHaveLength(2);
    expect(next.deductions.medicalExpensesPaid).toBe(150_000);
  });

  test("部分パッチは指定した項目だけを変え、税額控除も受け付ける", () => {
    const base = freshDeductionState();
    const next = applyDeductionPatch(base, {
      deductions: { dependents: { ...base.deductions.dependents, general: 2 } },
      taxCredits: { housingLoanBalance: 30_000_000 },
      filingType: "white",
      entries: { donations: [{ id: "d", recipient: "市", amount: 50_000 }] },
    });
    expect(next.deductions.dependents.general).toBe(2);
    expect(next.taxCredits.housingLoanBalance).toBe(30_000_000);
    expect(next.taxCredits.housingLoanRate).toBe(EMPTY_TAX_CREDIT_INPUTS.housingLoanRate);
    expect(next.filingType).toBe("white");
    expect(next.deductions.donationsTotal).toBe(50_000);
    expect(next.incomeTaxPayments).toEqual(base.incomeTaxPayments);
  });
});

describe("buildSnapshotFigures", () => {
  const transactions = [tx("2025-02-01", 5_000_000, "売上高"), tx("2025-02-10", -1_000_000, "外注費")];
  const taxResult = computeIncomeTax({
    year: 2025,
    totalIncome: 3_350_000,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: EMPTY_TAX_CREDIT_INPUTS,
  });

  test("所得の内訳は帳簿から、税額は計算結果から取る", () => {
    const figures = buildSnapshotFigures(transactions, 2025, { filingType: "blue65" }, undefined, taxResult);
    expect(figures).toEqual({
      business_income: 3_350_000,
      real_estate_income: 0,
      misc_income: 0,
      total_income: taxResult.totalIncome,
      total_deductions: taxResult.deductionsTotal,
      taxable_income: taxResult.taxableIncome,
      final_tax: taxResult.finalTax,
    });
  });

  test("計算結果が無い・対象年の取引が無い場合は null", () => {
    expect(buildSnapshotFigures(transactions, 2025, undefined, undefined, undefined)).toBeNull();
    expect(buildSnapshotFigures(transactions, 2024, undefined, undefined, taxResult)).toBeNull();
  });
});

describe("deriveBasePeriodSalesThousands", () => {
  test("2年前の課税売上（税込）を税抜にして千円未満を切り捨てる", () => {
    const transactions = [
      tx("2023-05-01", 11_000_000, "売上高", { tax_category: "課税売上10%" }),
      tx("2023-06-01", 1_080_000, "売上高", { tax_category: "課税売上8%" }),
    ];
    expect(deriveBasePeriodSalesThousands(transactions, 2025)).toBe(11_000);
  });

  test("2年前の帳簿が無ければ 0", () => {
    expect(deriveBasePeriodSalesThousands([tx("2025-01-01", 1_100_000, "売上高")], 2025)).toBe(0);
  });
});

describe("specialRelativeInputApplies", () => {
  test("特定親族特別控除のある年分（令和7年分以後）だけ入力を受ける", () => {
    expect(specialRelativeInputApplies(2024)).toBe(false);
    expect(specialRelativeInputApplies(2025)).toBe(true);
    expect(specialRelativeInputApplies(2026)).toBe(true);
    expect(specialRelativeInputApplies(2027)).toBe(true);
  });

  test("税務パラメータの無い年分は受けない", () => {
    expect(specialRelativeInputApplies(1999)).toBe(false);
  });
});
