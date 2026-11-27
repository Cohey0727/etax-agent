import { describe, expect, test } from "bun:test";
import {
  EMPTY_AGRICULTURE_INPUT,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  Transaction,
  buildXtxFiling,
  computeAgricultureStatement,
  computeCorrectedFigures,
  computeIncomeTax,
  computeManualIncomes,
  depreciationDetailRow,
  statementCategoryTotals,
  toEraDate,
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

function buildSample(amendment: boolean, filingType?: "blue65" | "white") {
  const figures = computeCorrectedFigures(TRANSACTIONS, 2023, { filingType });
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
      taxOfficeCode: "08121",
      myNumber: "",
      userId: "1234567890123456",
      occupation: "システムエンジニア",
      shopName: "",
      jan1Address: "",
    },
    figures,
    filingType,
    miscIncome: EMPTY_MISC_INCOME,
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

describe("buildXtxFiling の減価償却明細と貸借対照表", () => {
  test("減価償却明細が KOA210-3 に出て、貸借対照表が貸借一致で KOA210-4 に出る", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2023,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: { ...EMPTY_DEDUCTION_INPUTS },
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const depreciation = {
      business: [
        {
          name: "パソコン",
          quantity: "1台",
          acquisitionYearMonth: "2023-04",
          cost: 600_000,
          guaranteeAmount: null,
          basisAmount: 600_000,
          method: "straight_line" as const,
          methodLabel: "定額法",
          usefulLifeYears: 4,
          rate: 0.25,
          months: 9,
          ordinary: 112_500,
          total: 112_500,
          businessRatioPercent: 100,
          deductible: 112_500,
          closingBookValue: 487_500,
        },
      ],
      realEstate: [],
    };
    // 期首: 現金 1,000,000 = 元入金 1,000,000。期末は所得（控除前）を加えた元入金と一致させる
    const incomeBeforeBlue = figures._detail.business_income_before_deduction;
    const xtx = buildXtxFiling({
      year: 2023,
      amendment: false,
      submissionDate: "2024-03-10",
      taxpayer: {
        name: "テスト太郎",
        nameKana: "テストタロウ",
        zipCode: "7220062",
        address: "広島県尾道市向東町3567-1",
        addressLine2: "",
        birthDate: "1980-04-01",
        phone: "080-2500-7879",
        taxOfficeName: "尾道",
        taxOfficeCode: "08121",
        myNumber: "",
        userId: "1234567890123456",
        occupation: "システムエンジニア",
        shopName: "",
        jan1Address: "",
      },
      figures,
      deductionInputs: { ...EMPTY_DEDUCTION_INPUTS },
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
      depreciation,
      balanceSheet: {
        opening: { cash: 1_000_000, capital: 1_000_000 },
        closing: { cash: 1_000_000 + incomeBeforeBlue },
        ownerLoan: 0,
        ownerBorrowing: 0,
      },
    });
    expect(xtx).toContain("<KOA210-3");
    expect(xtx).toContain("<AMF01610>パソコン</AMF01610>");
    expect(xtx).toContain("<AMF01730>112500</AMF01730>");
    expect(xtx).toContain("<KOA210-4");
    expect(xtx).toContain("<AMG00230>1000000</AMG00230>");
    // 元入金は期末欄にも期首元入金の額を書き、合計は負債+事業主借+元入金+所得
    expect(xtx).toContain("<AMG00740>1000000</AMG00740>");
    expect(xtx).toContain(`<AMG00760>${1_000_000 + incomeBeforeBlue}</AMG00760>`);
  });

  test("貸借対照表: 事業主貸・事業主借がある場合も様式の合計式で一致する", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2023,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: { ...EMPTY_DEDUCTION_INPUTS },
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const incomeBeforeBlue = figures._detail.business_income_before_deduction;
    // 期末資産 = 現金（期首 + 所得 − 20万）+ 事業主貸30万
    //          = 負債0 + 事業主借10万 + 期首元入金100万 + 所得
    const xtx = buildXtxFiling({
      year: 2023,
      amendment: false,
      submissionDate: "2024-03-10",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア", shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: { ...EMPTY_DEDUCTION_INPUTS },
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
      balanceSheet: {
        opening: { cash: 1_000_000, capital: 1_000_000 },
        closing: { cash: 800_000 + incomeBeforeBlue },
        ownerLoan: 300_000,
        ownerBorrowing: 100_000,
      },
    });
    expect(xtx).toContain("<AMG00730>100000</AMG00730>"); // 事業主借
    expect(xtx).toContain("<AMG00740>1000000</AMG00740>"); // 元入金は期首額
    expect(xtx).toContain(`<AMG00760>${1_100_000 + incomeBeforeBlue}</AMG00760>`);
  });

  test("貸借が一致しない貸借対照表は例外にする", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2023,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: { ...EMPTY_DEDUCTION_INPUTS },
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    expect(() =>
      buildXtxFiling({
        year: 2023,
        amendment: false,
        submissionDate: "2024-03-10",
        taxpayer: {
          name: "テスト太郎",
          nameKana: "テストタロウ",
          zipCode: "7220062",
          address: "広島県尾道市向東町3567-1",
          addressLine2: "",
          birthDate: "1980-04-01",
          phone: "080-2500-7879",
          taxOfficeName: "尾道",
          taxOfficeCode: "08121",
          myNumber: "",
          userId: "1234567890123456",
          occupation: "システムエンジニア",
          shopName: "",
          jan1Address: "",
        },
        figures,
        deductionInputs: { ...EMPTY_DEDUCTION_INPUTS },
        miscIncome: EMPTY_MISC_INCOME,
        tax,
        categoryTotals: { business: {}, realEstate: {} },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
        balanceSheet: {
          opening: { cash: 500_000, capital: 1_000_000 },
          closing: { cash: 0 },
          ownerLoan: 0,
          ownerBorrowing: 0,
        },
      }),
    ).toThrow();
  });
});

describe("buildXtxFiling", () => {
  test("対応年分は 2023〜2026", () => {
    expect(xtxSupportedYears()).toEqual([2023, 2024, 2025, 2026]);
  });

  test("修正申告のXTXに手続・様式バージョンと主要金額が入る", () => {
    const xtx = buildSample(true);
    expect(xtx).toContain('<RKO0010 VR="23.1.1"');
    expect(xtx).toContain('<KOA020 VR="21.0"');
    expect(xtx).toContain('<KOA210 VR="11.0"');
    expect(xtx).toContain('<KOA220 VR="8.0"');
    // 収入金額等: 事業 12,000,000 / 不動産 1,764,000
    expect(xtx).toContain("<ABB00030>12000000</ABB00030>");
    expect(xtx).toContain("<ABB00050>1764000</ABB00050>");
    // 青色申告特別控除の合計 650,000（不動産・事業の合算限度、No.2072）
    expect(xtx).toContain("<ABB00800>650000</ABB00800>");
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

  test("通常の医療費控除では区分（ABB00435）を書かない（区分1はセルフメディケーション税制の印）", () => {
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
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア", shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: deductions,
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: 1_000_000,
    });
    expect(xtx).not.toContain("<ABB00435>");
    expect(xtx).toContain("<ABB00440>428000</ABB00440>");
  });

  test("白色申告では決算書の代わりに収支内訳書（KOA110/KOA130）が入る", () => {    const white = buildSample(false, "white");
    expect(white).toContain("<KOA110 ");
    expect(white).toContain("<KOA130 ");
    expect(white).not.toContain("<KOA210 ");
    expect(white).not.toContain("<KOA220 ");
    expect(white).toContain("<AIG00030>"); // 収支内訳書（一般用）の売上
    expect(white).toContain("<AKG00030>"); // 収支内訳書（不動産用）の賃貸料
    const blue = buildSample(false);
    expect(blue).toContain("<KOA210 ");
    expect(blue).toContain("<KOA220 ");
    expect(blue).not.toContain("<KOA110 ");
    expect(blue).not.toContain("<KOA130 ");
  });

  test("対応外の年分は例外", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2027,
      totalIncome: 0,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(() =>
      buildXtxFiling({
        year: 2027,
        amendment: false,
        submissionDate: "2028-02-01",
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
          userId: "",
          occupation: "",
          shopName: "",
          jan1Address: "",
        },
        figures,
        deductionInputs: EMPTY_DEDUCTION_INPUTS,
        miscIncome: EMPTY_MISC_INCOME,
        tax,
        categoryTotals: { business: {}, realEstate: {} },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
      }),
    ).toThrow();
  });

  test("雑所得（その他）は収入金額ク・所得⑨・計⑩に出て、合計⑫に含まれる", () => {
    const transactions: Transaction[] = [
      tx({ date: "2025-06-15", year: 2025, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
    ];
    const figures = computeCorrectedFigures(transactions, 2025);
    const miscIncome = { ...EMPTY_MISC_INCOME, revenue: 175_122, income: 175_122, kubun: 2 };
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome:
        figures._detail.business_income + figures._detail.real_estate_income + miscIncome.income,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const xtx = buildXtxFiling({
      year: 2025,
      amendment: true,
      submissionDate: "2026-11-20",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア", shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: 1_000_000,
    });
    // 収入金額等: 雑（その他）区分2・金額
    expect(xtx).toContain("<ABB00107>2</ABB00107>");
    expect(xtx).toContain("<ABB00110>175122</ABB00110>");
    // 所得金額等: ⑨その他・⑩計
    expect(xtx).toContain("<ABB01120>175122</ABB01120>");
    expect(xtx).toContain("<ABB01130>175122</ABB01130>");
    // 合計⑫ = 事業所得（12,000,000 − 青色650,000）+ 雑 175,122
    expect(xtx).toContain("<ABB00410>11525122</ABB00410>");
  });

  test("給与（調整控除）・公的年金等・業務は第一表の各欄に出て、合計⑫に含まれる", () => {
    const transactions: Transaction[] = [
      tx({ date: "2025-06-15", year: 2025, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
    ];
    const figures = computeCorrectedFigures(transactions, 2025);
    // 給与収入900万円・調整控除の対象 → 給与所得控除195万円、調整控除①5万円
    const salaryIncome = { revenue: 9_000_000, adjustmentEligible: true };
    // 公的年金等350万円（65歳以上）。年金以外の合計所得が1,000万円超
    // 2,000万円以下の区分になるため控除は10万円縮小し、年金雑所得は
    // 245万円。調整控除②10万円。業務は収入50万円・所得30万円。
    const miscIncome = {
      ...EMPTY_MISC_INCOME,
      pensionRevenue: 3_500_000,
      pensionOver65: true,
      businessRevenue: 500_000,
      businessIncome: 300_000,
    };
    const manual = computeManualIncomes(
      2025,
      salaryIncome,
      miscIncome,
      figures._detail.business_income + figures._detail.real_estate_income,
    );
    expect(manual.salary).toBe(6_900_000);
    expect(manual.pension).toBe(2_450_000);
    expect(manual.miscTotal).toBe(2_750_000);
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome:
        figures._detail.business_income + figures._detail.real_estate_income + manual.total,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const xtx = buildXtxFiling({
      year: 2025,
      amendment: false,
      submissionDate: "2026-11-20",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア", shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome,
      salaryIncome,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
    });
    // 収入金額等: 給与オ・公的年金等カ・業務キ
    expect(xtx).toContain("<ABB00080>9000000</ABB00080>");
    expect(xtx).toContain("<ABB00100>3500000</ABB00100>");
    expect(xtx).toContain("<ABB00105>500000</ABB00105>");
    // 所得金額等: 給与⑥（調整控除①②適用後）・年金⑦・業務⑧・計⑩
    expect(xtx).toContain("<ABB00370>6900000</ABB00370>");
    expect(xtx).toContain("<ABB01060>2450000</ABB01060>");
    expect(xtx).toContain("<ABB01090>300000</ABB01090>");
    expect(xtx).toContain("<ABB01130>2750000</ABB01130>");
    // 合計⑫ = 事業所得 11,350,000 + 給与 6,900,000 + 雑計 2,750,000
    expect(xtx).toContain("<ABB00410>21000000</ABB00410>");
  });

  test("公的年金等控除の判定に使う他の所得には農業所得も含める", () => {
    const agriculture = { ...EMPTY_AGRICULTURE_INPUT, salesAmount: 15_000_000 };
    const figures = computeCorrectedFigures([], 2025, { agriculture });
    const miscIncome = { ...EMPTY_MISC_INCOME, pensionRevenue: 3_000_000, pensionOver65: true };
    const ledgerIncome =
      figures._detail.business_income + figures._detail.real_estate_income + figures._detail.agriculture_income;
    const manual = computeManualIncomes(2025, { revenue: 0 }, miscIncome, ledgerIncome);
    // 公的年金等以外の合計所得金額が1,000万円超なので控除は 110万 − 10万
    expect(manual.pension).toBe(2_000_000);
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome: ledgerIncome + manual.total,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const xtx = buildXtxFiling({
      year: 2025,
      amendment: false,
      submissionDate: "2026-03-10",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1950-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "農業", shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome,
      agriculture: {
        statement: computeAgricultureStatement(agriculture),
        blueDeduction: figures._detail.blue_deduction_agriculture,
      },
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
    });
    expect(xtx).toContain("<ABB01060>2000000</ABB01060>");
    expect(xtx).toContain("<ABB01130>2000000</ABB01130>");
    expect(xtx).toContain(`<ABB00410>${ledgerIncome + 2_000_000}</ABB00410>`);
  });
});

/** 年分だけ変えた最小の申告データ（バージョン・構造の確認用）。 */
function buildMinimal(year: number) {
  const transactions: Transaction[] = [
    tx({ date: `${year}-06-15`, year, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
  ];
  const figures = computeCorrectedFigures(transactions, year);
  const tax = computeIncomeTax({
    year,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year,
    amendment: false,
    submissionDate: "2026-11-20",
    taxpayer: {
      name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
      address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
      phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
      myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア",
      shopName: "", jan1Address: "",
    },
    figures,
    deductionInputs: EMPTY_DEDUCTION_INPUTS,
    miscIncome: EMPTY_MISC_INCOME,
    tax,
    categoryTotals: { business: {}, realEstate: {} },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
  });
}

describe("buildXtxFiling の仕様適合（公式XMLスキーマ準拠）", () => {
  test("手続バージョンは手続内帳票対応表の組（様式より2世代先）", () => {
    expect(buildMinimal(2023)).toContain('<RKO0010 VR="23.1.1"');
    expect(buildMinimal(2023)).toContain('<KOA020 VR="21.0"');
    expect(buildMinimal(2024)).toContain('<RKO0010 VR="24.0.1"');
    expect(buildMinimal(2024)).toContain('<KOA020 VR="22.0"');
    expect(buildMinimal(2025)).toContain('<RKO0010 VR="25.0.1"');
    expect(buildMinimal(2025)).toContain('<KOA020 VR="23.0"');
    expect(buildMinimal(2026)).toContain('<RKO0010 VR="26.0.1"');
    expect(buildMinimal(2026)).toContain('<KOA020 VR="24.0"');
    expect(buildMinimal(2026)).toContain('<KOA210 VR="12.0"');
  });

  test("2026年分の決算書バージョンは KOA210=12.0 / KOA220=9.0（令和9年1月受付開始の帳票一覧）", () => {
    const transactions: Transaction[] = [
      tx({ date: "2026-06-15", year: 2026, description: "事業売上", amount: 12_000_000, category: "売上高", income_type: "business" }),
      tx({ date: "2026-06-15", year: 2026, description: "家賃収入", amount: 1_764_000, category: "家賃収入", income_type: "real_estate" }),
    ];
    const figures = computeCorrectedFigures(transactions, 2026);
    const tax = computeIncomeTax({
      year: 2026,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
    });
    const xtx = buildXtxFiling({
      year: 2026,
      amendment: false,
      submissionDate: "2027-02-01",
      taxpayer: {
        name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
        address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
        phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
        myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア",
        shopName: "", jan1Address: "",
      },
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: {}, realEstate: { 家賃収入: 1_764_000 } },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
    });
    expect(xtx).toContain('<KOA210 VR="12.0"');
    expect(xtx).toContain('<KOA220 VR="9.0"');
  });

  test("DATA・RKO0010 のデフォルト名前空間は shotoku", () => {
    const xtx = buildMinimal(2023);
    expect(xtx).toContain('<DATA id="DATA" xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku">');
    expect(xtx).toContain('xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku" xmlns:gen=');
    expect(xtx).not.toContain("XSD/kyotsu");
  });

  test("IT部は ITdefinition.xsd のシーケンス順で必須要素を含む", () => {
    const xtx = buildSample(true);
    const order = [
      "ZEIMUSHO", "TEISYUTSU_DAY", "NOZEISHA_ID", "NOZEISHA_NM_KN", "NOZEISHA_NM",
      "NOZEISHA_ZIP", "NOZEISHA_ADR", "NOZEISHA_TEL", "BIRTHDAY", "SHOKUGYO",
      "TETSUZUKI", "NENBUN", "SHINKOKU_KBN",
    ];
    const positions = order.map((tag) => xtx.indexOf(`<${tag} ID=`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(xtx).toContain('<NOZEISHA_ID ID="NOZEISHA_ID">1234567890123456</NOZEISHA_ID>');
    expect(xtx).toContain('<TETSUZUKI ID="TETSUZUKI"><procedure_CD>RKO0010</procedure_CD></TETSUZUKI>');
    // ZEIMUSHO の子要素名は XSD 定義どおり先頭小文字
    expect(xtx).toContain("<gen:zeimusho_CD>08121</gen:zeimusho_CD>");
    expect(xtx).toContain("<gen:zeimusho_NM>尾道</gen:zeimusho_NM>");
    expect(xtx).not.toContain("<gen:ZEIMUSHO_CD>");
    expect(xtx).not.toContain("<gen:ZEIMUSHO_NM>");
  });

  test("CATALOG の FORM_SEC に様式IDを列挙する", () => {
    const xtx = buildSample(true);
    expect(xtx).toContain("<rdf:li>KOA020</rdf:li>");
    expect(xtx).toContain("<rdf:li>KOA210</rdf:li>");
    expect(xtx).toContain("<rdf:li>KOA220</rdf:li>");
  });

  test("利用者識別番号が無ければ例外（IT部の必須要素）", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
    const tax = computeIncomeTax({
      year: 2023,
      totalIncome: 0,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(() =>
      buildXtxFiling({
        year: 2023,
        amendment: false,
        submissionDate: "2026-11-20",
        taxpayer: {
          name: "テスト太郎", nameKana: "", zipCode: "", address: "広島県尾道市向東町3567-1",
          addressLine2: "", birthDate: "", phone: "", taxOfficeName: "尾道",
          taxOfficeCode: "08121", myNumber: "", userId: "", occupation: "",
          shopName: "", jan1Address: "",
        },
        figures,
        deductionInputs: EMPTY_DEDUCTION_INPUTS,
        miscIncome: EMPTY_MISC_INCOME,
        tax,
        categoryTotals: { business: {}, realEstate: {} },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
      }),
    ).toThrow(/利用者識別番号/);
  });
});

describe("第一表の区分・欠落タグ・税額チェーン (#3-2/#3-3)", () => {
  const TAXPAYER = {
    name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
    address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
    phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
    myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア",
    shopName: "", jan1Address: "",
  };

  function buildCustom(opts: {
    year: number;
    deductions?: Partial<typeof EMPTY_DEDUCTION_INPUTS>;
    taxCredits?: Partial<typeof EMPTY_TAX_CREDIT_INPUTS>;
    filingType?: "blue65" | "white";
    withholdingTax?: number;
    txs?: Transaction[];
  }) {
    const figures = computeCorrectedFigures(opts.txs ?? TRANSACTIONS, opts.year, {
      filingType: opts.filingType,
    });
    const deductionInputs = { ...EMPTY_DEDUCTION_INPUTS, ...opts.deductions };
    const tax = computeIncomeTax({
      year: opts.year,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: deductionInputs,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, ...opts.taxCredits },
    });
    const xtx = buildXtxFiling({
      year: opts.year,
      amendment: false,
      submissionDate: "2026-03-10",
      taxpayer: TAXPAYER,
      figures,
      filingType: opts.filingType,
      deductionInputs,
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: {}, realEstate: {} },
      withholdingTax: opts.withholdingTax ?? 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
    });
    return { xtx, tax };
  }

  const tagValue = (xml: string, tag: string) =>
    Number(xml.match(new RegExp(`<${tag}>(-?\\d+)</${tag}>`))?.[1]);

  test("寡婦・ひとり親控除の区分（ABB00495）は、ひとり親控除のときだけ1を書く", () => {
    const txs = [tx({ date: "2025-06-15", year: 2025, amount: 3_000_000, category: "売上高" })];
    const widow = buildCustom({ year: 2025, txs, deductions: { isWidow: true } });
    expect(widow.tax.deductions.widow).toBe(270_000);
    expect(widow.xtx).not.toContain("<ABB00495>");
    expect(tagValue(widow.xtx, "ABB00500")).toBe(270_000);
    const single = buildCustom({ year: 2025, txs, deductions: { isSingleParent: true } });
    expect(single.tax.deductions.singleParent).toBe(350_000);
    expect(single.xtx).toContain("<ABB00495>1</ABB00495>");
    expect(tagValue(single.xtx, "ABB00500")).toBe(350_000);
  });

  test("白色申告は申告区分 ABA00240 = 2", () => {
    const { xtx } = buildCustom({ year: 2025, filingType: "white" });
    expect(xtx).toContain("<ABA00240><kubun_CD>2</kubun_CD></ABA00240>");
  });

  test("令和6年分は定額減税のチェーン（ABB00682/684/686/688）を出す", () => {
    const { xtx, tax } = buildCustom({ year: 2024, taxCredits: { flatReduction: 60_000 } });
    expect(tagValue(xtx, "ABB00670")).toBe(tax.taxAfterOtherCredits + 60_000);
    expect(tagValue(xtx, "ABB00682")).toBe(tax.standardIncomeTax + 60_000);
    expect(xtx).toContain("<ABB00686>2</ABB00686>"); // 60,000 ÷ 30,000 = 2人
    expect(xtx).toContain("<ABB00688>60000</ABB00688>");
    expect(tagValue(xtx, "ABB01010")).toBe(tax.standardIncomeTax);
  });

  test("特定親族特別控除は ABB00542 グループに出し、扶養控除 ABB00540 と分ける", () => {
    const { xtx, tax } = buildCustom({
      year: 2025,
      deductions: {
        specialRelativeTotalIncome: 1_000_000,
        dependents: { general: 1, specific: 0, elderly: 0, elderlyCohabiting: 0 },
      },
    });
    expect(tax.deductions.specialRelative).toBe(410_000);
    expect(xtx).toContain("<ABB00546>1</ABB00546>");
    expect(xtx).toContain("<ABB00548>410000</ABB00548>");
    expect(tagValue(xtx, "ABB00540")).toBe(tax.deductions.dependents);
  });

  test("外国税額控除があっても申告納税額 ABB00720 は所得税の計算結果（finalTax）と一致する", () => {
    const { xtx, tax } = buildCustom({
      year: 2025,
      taxCredits: { foreignTaxPaid: 500_000, foreignIncome: 3_000_000 },
    });
    expect(tax.taxCredits.foreignTax).toBeGreaterThan(0);
    // 基準所得税額は外国税額控除を適用する前の額で、外国税額控除は ABB01040 で一度だけ引く
    expect(tagValue(xtx, "ABB01010")).toBe(tax.taxAfterOtherCredits);
    expect(tagValue(xtx, "ABB01020")).toBe(tax.reconstructionTaxGross);
    expect(tagValue(xtx, "ABB01040")).toBe(tax.taxCredits.foreignTax);
    expect(tagValue(xtx, "ABB00720")).toBe(tax.finalTax);
  });

  test("令和6年分で定額減税が所得税額を上回っても、差引所得税額・再差引所得税額は所得税額を超えない", () => {
    const { xtx, tax } = buildCustom({
      year: 2024,
      txs: [tx({ date: "2024-06-15", year: 2024, amount: 1_500_000, category: "売上高" })],
      taxCredits: { flatReduction: 90_000 },
    });
    expect(tax.incomeTaxBase).toBeLessThan(90_000);
    expect(tagValue(xtx, "ABB00670")).toBe(tax.incomeTaxBase);
    expect(tagValue(xtx, "ABB00682")).toBe(tax.incomeTaxBase);
    // 特別税額控除は 3万円 × 人数 を書き、再々差引所得税額（基準所得税額）は 0 になる
    expect(tagValue(xtx, "ABB00688")).toBe(90_000);
    expect(tagValue(xtx, "ABB01010")).toBe(0);
  });

  test("住宅借入金等特別控除と定額減税で税額が0になっても、差引所得税額は定額減税前の額", () => {
    const { xtx, tax } = buildCustom({
      year: 2024,
      txs: [tx({ date: "2024-06-15", year: 2024, amount: 1_500_000, category: "売上高" })],
      taxCredits: {
        flatReduction: 30_000,
        housingLoanBalance: 1_000_000,
        housingLoanLimit: 30_000_000,
        housingLoanRate: 0.007,
      },
    });
    const housingLoan = tax.taxCredits.housingLoan;
    expect(housingLoan).toBeGreaterThan(0);
    expect(housingLoan).toBeLessThan(tax.incomeTaxBase);
    expect(tagValue(xtx, "ABB00670")).toBe(tax.incomeTaxBase - housingLoan);
    expect(tagValue(xtx, "ABB01010")).toBe(tax.taxAfterOtherCredits);
  });

  test("還付になる場合は ABB00720 を負のまま出す（0にクランプしない）", () => {
    const { xtx, tax } = buildCustom({ year: 2025, withholdingTax: 2_000_000 });
    const raw = tax.taxAfterOtherCredits + tax.reconstructionTaxGross - 2_000_000;
    expect(raw).toBeLessThan(0);
    expect(tagValue(xtx, "ABB00720")).toBe(raw);
    expect(tagValue(xtx, "ABB00760")).toBe(-raw);
  });

  test("科目内に返品・返金があっても、決算書の収入・経費は科目ごとの純額で、経費計は経費の行の合計", () => {
    const txs = [
      tx({ date: "2025-06-15", year: 2025, amount: 1_000_000, category: "売上高" }),
      tx({ date: "2025-06-15", year: 2025, amount: -50_000, category: "売上高" }),
      tx({ date: "2025-06-15", year: 2025, amount: -100_000, category: "通信費" }),
      tx({ date: "2025-06-15", year: 2025, amount: 10_000, category: "通信費" }),
      tx({ date: "2025-06-15", year: 2025, amount: 1_200_000, category: "家賃収入", income_type: "real_estate" }),
      tx({ date: "2025-06-15", year: 2025, amount: -200_000, category: "修繕費", income_type: "real_estate" }),
      tx({ date: "2025-06-15", year: 2025, amount: 20_000, category: "修繕費", income_type: "real_estate" }),
    ];
    for (const filingType of ["blue65", "white"] as const) {
      const figures = computeCorrectedFigures(txs, 2025, { filingType });
      const tax = computeIncomeTax({
        year: 2025,
        totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
        deductions: EMPTY_DEDUCTION_INPUTS,
        taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      });
      const xtx = buildXtxFiling({
        year: 2025,
        amendment: false,
        submissionDate: "2026-03-10",
        taxpayer: TAXPAYER,
        figures,
        filingType,
        deductionInputs: EMPTY_DEDUCTION_INPUTS,
        miscIncome: EMPTY_MISC_INCOME,
        tax,
        categoryTotals: {
          business: statementCategoryTotals(txs, "business"),
          realEstate: statementCategoryTotals(txs, "real_estate"),
        },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
      });
      // 第一表の収入金額は決算書の売上（収入）金額と同じ純額
      expect(tagValue(xtx, "ABB00030")).toBe(950_000);
      expect(tagValue(xtx, "ABB00050")).toBe(1_200_000);
      if (filingType === "blue65") {
        expect(tagValue(xtx, "AMF00100")).toBe(950_000);
        expect(tagValue(xtx, "AMF00230")).toBe(90_000);
        expect(tagValue(xtx, "AMF00380")).toBe(90_000);
        expect(tagValue(xtx, "AMF00390")).toBe(860_000);
        expect(tagValue(xtx, "ANF00110")).toBe(1_200_000);
        expect(xtx).not.toContain("<ANF00050>");
        expect(tagValue(xtx, "ANF00150")).toBe(180_000);
        expect(tagValue(xtx, "ANF00220")).toBe(180_000);
      } else {
        expect(tagValue(xtx, "AIG00060")).toBe(950_000);
        expect(tagValue(xtx, "AIG00260")).toBe(90_000);
        expect(tagValue(xtx, "AIG00360")).toBe(90_000);
        expect(tagValue(xtx, "AKG00080")).toBe(1_200_000);
        expect(tagValue(xtx, "AKG00220")).toBe(180_000);
      }
    }
  });

  test("分類カテゴリ「外注工賃」は固定行「外注費」AMF00320 に合算される", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2025);
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    const xtx = buildXtxFiling({
      year: 2025,
      amendment: false,
      submissionDate: "2026-03-10",
      taxpayer: TAXPAYER,
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: { 外注費: 100_000, 外注工賃: 550_000 }, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
    });
    expect(xtx).toContain("<AMF00320>650000</AMF00320>");
    expect(xtx).not.toContain("外注工賃");
  });

  test("追加科目が様式の上限（6件）を超えたら超過分は雑費に合算される", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2025);
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    const extras: Record<string, number> = {};
    for (let i = 1; i <= 8; i++) extras[`追加科目${i}`] = i * 10_000;
    const xtx = buildXtxFiling({
      year: 2025,
      amendment: false,
      submissionDate: "2026-03-10",
      taxpayer: TAXPAYER,
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: { ...extras, 雑費: 5_000 }, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
    });
    expect(xtx.match(/<AMF00355>/g)).toHaveLength(6);
    // 雑費 = 5,000 + 超過2件（70,000 + 80,000）
    expect(xtx).toContain("<AMF00370>155000</AMF00370>");
  });

  test("減価償却明細が様式の上限（KOA210 は7件）を超えたら例外", () => {
    const figures = computeCorrectedFigures(TRANSACTIONS, 2025);
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    const rows = Array.from({ length: 8 }, (_, i) =>
      depreciationDetailRow(
        `資産${i}`,
        {
          acquisitionDate: "2025-04-01",
          cost: 100_000,
          usefulLifeYears: 4,
          method: "straight_line",
          businessRatioPercent: 100,
        },
        2025,
      ),
    ).filter((r) => r !== null);
    expect(rows).toHaveLength(8);
    expect(() =>
      buildXtxFiling({
        year: 2025,
        amendment: false,
        submissionDate: "2026-03-10",
        taxpayer: TAXPAYER,
        figures,
        deductionInputs: EMPTY_DEDUCTION_INPUTS,
        miscIncome: EMPTY_MISC_INCOME,
        tax,
        categoryTotals: { business: {}, realEstate: {} },
        withholdingTax: 0,
        prepaidTax: 0,
        originalThirdPeriodTax: null,
        depreciation: { business: rows, realEstate: [] },
      }),
    ).toThrow(/上限 7 件/);
  });

  test("配偶者控除のみ（特別控除なし）では ABB00515 を立てない", () => {
    const { xtx, tax } = buildCustom({
      year: 2025,
      // 配偶者控除は本人の合計所得1,000万円以下が要件なので小さい取引で組む
      txs: [
        tx({ date: "2025-06-15", year: 2025, description: "事業売上", amount: 5_000_000, category: "売上高", income_type: "business" }),
      ],
      deductions: { spouseCategory: "general", spouseTotalIncome: 400_000 },
    });
    expect(tax.deductions.spouse).toBeGreaterThan(0);
    expect(tax.deductions.spouseSpecial).toBe(0);
    expect(xtx).not.toContain("ABB00515");
  });
});

describe("toEraDate の元号境界 (#3-4)", () => {
  test("改元の月日境界で元号が切り替わる", () => {
    expect(toEraDate("2019-04-30")).toEqual({ era: 4, yy: 31, mm: 4, dd: 30 }); // 平成31年
    expect(toEraDate("2019-05-01")).toEqual({ era: 5, yy: 1, mm: 5, dd: 1 }); // 令和元年
    expect(toEraDate("1989-01-07")).toEqual({ era: 3, yy: 64, mm: 1, dd: 7 }); // 昭和64年
    expect(toEraDate("1989-01-08")).toEqual({ era: 4, yy: 1, mm: 1, dd: 8 }); // 平成元年
    expect(toEraDate("1926-12-24")).toEqual({ era: 2, yy: 15, mm: 12, dd: 24 }); // 大正15年
    expect(toEraDate("1926-12-25")).toEqual({ era: 3, yy: 1, mm: 12, dd: 25 }); // 昭和元年
    expect(toEraDate("1912-07-29")).toEqual({ era: 1, yy: 45, mm: 7, dd: 29 }); // 明治45年
    expect(toEraDate("1912-07-30")).toEqual({ era: 2, yy: 1, mm: 7, dd: 30 }); // 大正元年
    expect(toEraDate("1868-10-22")).toBeNull();
  });
});

describe("自由記述の正規化と様式の桁数", () => {
  const TAXPAYER = {
    name: "テスト太郎", nameKana: "テストタロウ", zipCode: "7220062",
    address: "広島県尾道市向東町3567-1", addressLine2: "", birthDate: "1980-04-01",
    phone: "080-2500-7879", taxOfficeName: "尾道", taxOfficeCode: "08121",
    myNumber: "", userId: "1234567890123456", occupation: "システムエンジニア",
    shopName: "", jan1Address: "",
  };

  function build(opts: {
    taxpayer?: Partial<typeof TAXPAYER>;
    business?: Record<string, number>;
    depreciationName?: string;
  }) {
    const txs = [tx({ date: "2025-06-15", year: 2025, amount: 3_000_000, category: "売上高" })];
    const figures = computeCorrectedFigures(txs, 2025);
    const tax = computeIncomeTax({
      year: 2025,
      totalIncome: figures._detail.business_income,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    const row = opts.depreciationName
      ? depreciationDetailRow(
          opts.depreciationName,
          { acquisitionDate: "2025-04-01", cost: 600_000, usefulLifeYears: 4, method: "straight_line", businessRatioPercent: 100 },
          2025,
        )
      : null;
    return buildXtxFiling({
      year: 2025,
      amendment: false,
      submissionDate: "2026-03-10",
      taxpayer: { ...TAXPAYER, ...opts.taxpayer },
      figures,
      deductionInputs: EMPTY_DEDUCTION_INPUTS,
      miscIncome: EMPTY_MISC_INCOME,
      tax,
      categoryTotals: { business: opts.business ?? {}, realEstate: {} },
      withholdingTax: 0,
      prepaidTax: 0,
      originalThirdPeriodTax: null,
      depreciation: row ? { business: [row], realEstate: [] } : undefined,
    });
  }

  test("半角カナ・全角英数は NFKC で寄せて出す", () => {
    const xtx = build({ taxpayer: { address: "広島県尾道市向東町３５６７－１ ｺｰﾎﾟ尾道101", shopName: "ﾃｽﾄ商店" } });
    expect(xtx).toContain('<NOZEISHA_ADR ID="NOZEISHA_ADR">広島県尾道市向東町3567-1 コーポ尾道101</NOZEISHA_ADR>');
    expect(xtx).toContain('<NOZEISHA_YAGO ID="NOZEISHA_YAGO">テスト商店</NOZEISHA_YAGO>');
  });

  test("XML に書けない制御文字は出力しない", () => {
    const xtx = build({ business: { "会議\u0001費": 10_000 } });
    expect(xtx).not.toContain("\u0001");
    expect(xtx).toContain("<AMF00060>会議費</AMF00060>");
  });

  test("様式の上限桁を超える自由記述は項目名つきの例外にする", () => {
    expect(() => build({ depreciationName: "MacBook Pro 14インチ M3 Max" })).toThrow(/資産の名称.*16文字/);
    expect(() => build({ business: { クラウドサービス利用料: 10_000 } })).toThrow(/勘定科目.*10文字/);
    expect(() => build({ taxpayer: { shopName: "あ".repeat(31) } })).toThrow(/屋号.*30文字/);
    expect(() => build({ taxpayer: { occupation: "い".repeat(21) } })).toThrow(/職業.*20文字/);
    // 上限ちょうどは出力できる
    expect(build({ depreciationName: "あ".repeat(16) })).toContain(`<AMF01610>${"あ".repeat(16)}</AMF01610>`);
  });
});
