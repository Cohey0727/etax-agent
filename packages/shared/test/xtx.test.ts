import { describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_TAX_CREDIT_INPUTS,
  Transaction,
  buildXtxFiling,
  computeCorrectedFigures,
  computeIncomeTax,
  xtxSupportedYears,
} from "../src";

function tx(partial: Partial<Transaction>): Transaction {
  return {
    date: "2023-06-15",
    year: 2023,
    description: "テスト",
    amount: 0,
    account: "普通預金",
    category: "未分類",
    income_type: "business",
    tax_category: "",
    ...partial,
  };
}

const TRANSACTIONS: Transaction[] = [
  tx({ description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
  tx({ description: "家賃収入", amount: 1_764_000, category: "家賃収入", income_type: "real_estate" }),
  tx({ description: "通信費", amount: -1_200_000, category: "通信費", income_type: "business" }),
  tx({ description: "消耗品費", amount: -900_000, category: "消耗品費", income_type: "business" }),
  tx({ description: "固定資産税", amount: -300_000, category: "租税公課", income_type: "real_estate" }),
  tx({ description: "管理費", amount: -170_000, category: "管理費", income_type: "real_estate" }),
];

function buildSample(amendment: boolean) {
  const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
  const tax = computeIncomeTax({
    year: 2023,
    totalIncome:
      figures._detail.business_income + figures._detail.real_estate_income,
    deductions: {
      ...EMPTY_DEDUCTION_INPUTS,
      socialInsurancePaid: 1_200_000,
      lifeInsurance: {
        newGeneral: 120_000,
        newCareMedical: 0,
        newPension: 0,
        oldGeneral: 0,
        oldPension: 0,
      },
    },
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year: 2023,
    amendment,
    submissionDate: "2026-11-20",
    taxpayer: {
      name: "テスト太郎",
      nameKana: "テストタロウ",
      zipCode: "7220062",
      address: "広島県尾道市向東町3567-1",
      addressLine2: "",
      birthDate: "1980-04-01",
      phone: "080-2500-7879",
      taxOfficeName: "尾道",
      taxOfficeCode: "",
      myNumber: "",
      occupation: "システムエンジニア",
      shopName: "",
      jan1Address: "",
    },
    figures,
    deductionInputs: {
      ...EMPTY_DEDUCTION_INPUTS,
      socialInsurancePaid: 1_200_000,
      lifeInsurance: {
        newGeneral: 120_000,
        newCareMedical: 0,
        newPension: 0,
        oldGeneral: 0,
        oldPension: 0,
      },
    },
    tax,
    categoryTotals: {
      business: { 通信費: 1_200_000, 消耗品費: 900_000 },
      realEstate: { 家賃収入: 1_764_000, 租税公課: 300_000, 管理費: 170_000 },
    },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: amendment ? 1_480_000 : null,
  });
}

describe("buildXtxFiling", () => {
  test("対応年分は 2023〜2025", () => {
    expect(xtxSupportedYears()).toEqual([2023, 2024, 2025]);
  });

  test("修正申告のXTXに手続・様式バージョンと主要金額が入る", () => {
    const xtx = buildSample(true);
    expect(xtx).toContain('<RKO0010 VR="21.0.2"');
    expect(xtx).toContain('<KOA020 VR="21.0"');
    expect(xtx).toContain('<KOA210 VR="11.0"');
    expect(xtx).toContain('<KOA220 VR="8.0"');
    // 収入金額等: 事業 12,000,000 / 不動産 1,764,000
    expect(xtx).toContain("<ABB00030>12000000</ABB00030>");
    expect(xtx).toContain("<ABB00050>1764000</ABB00050>");
    // 青色申告特別控除の合計 750,000
    expect(xtx).toContain("<ABB00800>750000</ABB00800>");
    // 修正申告欄: 修正前の第3期分の税額
    expect(xtx).toContain("<ABB00765>1480000</ABB00765>");
    // 決算書: 売上・賃貸料
    expect(xtx).toContain("<AMF00100>12000000</AMF00100>");
    expect(xtx).toContain("<ANF00080>1764000</ANF00080>");
    // IT部: 申告区分=修正(2)
    expect(xtx).toContain('<SHINKOKU_KBN ID="SHINKOKU_KBN"><kubun_CD>2</kubun_CD></SHINKOKU_KBN>');
    // 申告納税額と増加額は100円未満切捨て（国税通則法119条）
    const declared = Number(/<ABB00720>(\d+)<\/ABB00720>/.exec(xtx)?.[1]);
    const increase = Number(/<ABB00767>(\d+)<\/ABB00767>/.exec(xtx)?.[1]);
    expect(declared % 100).toBe(0);
    expect(increase % 100).toBe(0);
    // このサンプルは税額が減る修正なので増加額は0にクランプされる
    expect(increase).toBe(Math.max(declared - 1_480_000, 0));
  });

  test("確定申告では修正申告欄を出さない", () => {
    const xtx = buildSample(false);
    expect(xtx).not.toContain("ABB00763");
    expect(xtx).toContain('<SHINKOKU_KBN ID="SHINKOKU_KBN"><kubun_CD>1</kubun_CD></SHINKOKU_KBN>');
  });

  test("医療費控除の区分（ABB00435）は単純型として内容に直接書く", () => {
    const transactions: Transaction[] = [
      tx({ date: "2025-06-15", year: 2025, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
    ];
    const figures = computeCorrectedFigures(transactions, 2025);
    const deductions = { ...EMPTY_DEDUCTION_INPUTS, medicalExpensesPaid: 528_000 };
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const xtx = buildXtxFiling({
      year: 2025,
      amendment: true,
      submissionDate: "2026-11-20",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "",
        myNumber: "", occupation: "システムエンジニア", shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: deductions,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: 1_000_000,
    });
    expect(xtx).toContain("<ABB00435>1</ABB00435>");
    expect(xtx).not.toContain("<ABB00435><kubun_CD>");
    expect(xtx).toContain("<ABB00440>428000</ABB00440>");
  });

  test("対応外の年分は例外", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2026,
      totalIncome: 0,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(() =>
      buildXtxFiling({
        year: 2026,
        amendment: false,
        submissionDate: "2027-02-01",
        taxpayer: {
          name: "",
          nameKana: "",
          zipCode: "",
          address: "",
          addressLine2: "",
          birthDate: "",
          phone: "",
          taxOfficeName: "",
          taxOfficeCode: "",
          myNumber: "",
          occupation: "",
          shopName: "",
          jan1Address: "",
        },
        figures,
        deductionInputs: EMPTY_DEDUCTION_INPUTS,
        tax,
        categoryTotals: { business: {}, realEstate: {} },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
      }),
    ).toThrow();
  });
});
