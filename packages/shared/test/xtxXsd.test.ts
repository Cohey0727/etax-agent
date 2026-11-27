/**
 * xtxXsd.test.ts — 生成 XTX の公式 XML スキーマ検証（常時実行）。
 *
 * 公式 XSD は packages/shared/assets/etax-xsd に同梱済み（e-Tax 仕様書
 * 「19 XMLスキーマ」令和8年9月版から、検証対象の手続が参照する 296
 * ファイルの閉包のみ。取得・更新手順は同フォルダの README 参照）。
 * 環境変数 ETAX_XSD_DIR があればそちらを優先する。
 * 検証には python3 + lxml が必要（無い環境ではスキップ扱いで通過）。
 *
 * 手続VR・名前空間・IT部の必須要素と並び順・zeimusho の表記を外すと
 * WEB版「作成済みデータの利用」で SE00S170 になるため、この検証で担保する。
 * 構造面の常時チェックは xtx.test.ts / xtxShohi.test.ts 側にもある。
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  ExpandedIncomeInput,
  Transaction,
  XtxTaxpayer,
  buildConsumptionXtx,
  buildSimplifiedConsumptionXtx,
  buildSpecial20ConsumptionXtx,
  buildXtxFiling,
  computeConsumptionReturn,
  computeCorrectedFigures,
  computeExpandedIncomes,
  computeIncomeTax,
  computeSimplifiedConsumptionReturn,
  computeSpecial20ConsumptionReturn,
  depreciationDetailRow,
  expandedWithholdingTotal,
  resolveTaxCreditInputs,
  salaryIncomeAmount,
} from "../src";

const XSD_DIR = process.env.ETAX_XSD_DIR ?? join(import.meta.dir, "../assets/etax-xsd");
const maybe = existsSync(join(XSD_DIR, "shotoku/RKO0010-250.xsd")) ? test : test.skip;

const TAXPAYER: XtxTaxpayer = {
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
};

function incomeSample(year: number): string {
  const transactions: Transaction[] = [
    {
      date: `${year}-06-15`,
      year,
      description: "事業売上",
      amount: 12_000_000,
      account: "普通預金",
      category: "売上高",
      income_type: "business",
      tax_category: "",
    },
    {
      date: `${year}-06-15`,
      year,
      description: "家賃収入",
      amount: 1_764_000,
      account: "普通預金",
      category: "家賃収入",
      income_type: "real_estate",
      tax_category: "",
    },
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
    amendment: true,
    submissionDate: "2026-11-20",
    taxpayer: TAXPAYER,
    figures,
    deductionInputs: EMPTY_DEDUCTION_INPUTS,
    miscIncome: EMPTY_MISC_INCOME,
    tax,
    categoryTotals: { business: {}, realEstate: { 家賃収入: 1_764_000 } },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: 1_000_000,
  });
}

/** 令和6年分・定額減税あり（ABB00682/684 の XSD 検証用） */
function flatReductionSample(): string {
  const year = 2024;
  const transactions: Transaction[] = [
    { date: `${year}-06-15`, year, description: "事業売上", amount: 12_000_000, account: "普通預金", category: "売上高", income_type: "business", tax_category: "" },
  ];
  const figures = computeCorrectedFigures(transactions, year);
  const tax = computeIncomeTax({
    year,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, flatReduction: 30_000 },
  });
  return buildXtxFiling({
    year,
    amendment: false,
    submissionDate: "2025-03-10",
    taxpayer: TAXPAYER,
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

/** 令和7年分・特定親族特別控除あり（ABB00542 の XSD 検証用） */
function specialRelativeSample(): string {
  const year = 2025;
  const transactions: Transaction[] = [
    { date: `${year}-06-15`, year, description: "事業売上", amount: 12_000_000, account: "普通預金", category: "売上高", income_type: "business", tax_category: "" },
  ];
  const figures = computeCorrectedFigures(transactions, year);
  const deductionInputs = {
    ...EMPTY_DEDUCTION_INPUTS,
    specialRelativeTotalIncome: 1_000_000,
  };
  const tax = computeIncomeTax({
    year,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: deductionInputs,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year,
    amendment: false,
    submissionDate: "2026-03-10",
    taxpayer: TAXPAYER,
    figures,
    deductionInputs,
    miscIncome: EMPTY_MISC_INCOME,
    tax,
    categoryTotals: { business: {}, realEstate: {} },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
  });
}

function salarySample(year: number): string {
  const transactions: Transaction[] = [
    {
      date: `${year}-06-15`,
      year,
      description: "事業売上",
      amount: 3_000_000,
      account: "普通預金",
      category: "売上高",
      income_type: "business",
      tax_category: "",
    },
  ];
  const figures = computeCorrectedFigures(transactions, year);
  const salaryRevenue = 5_000_000;
  const tax = computeIncomeTax({
    year,
    totalIncome:
      figures._detail.business_income +
      figures._detail.real_estate_income +
      salaryIncomeAmount(year, salaryRevenue),
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year,
    amendment: false,
    submissionDate: "2026-03-10",
    taxpayer: TAXPAYER,
    figures,
    deductionInputs: EMPTY_DEDUCTION_INPUTS,
    miscIncome: EMPTY_MISC_INCOME,
    salaryIncome: { revenue: salaryRevenue },
    tax,
    categoryTotals: { business: {}, realEstate: {} },
    withholdingTax: 500_000,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
  });
}

function whiteSample(year: number): string {
  const transactions: Transaction[] = [
    { date: `${year}-06-15`, year, description: "事業売上", amount: 12_000_000, account: "普通預金", category: "売上高", income_type: "business", tax_category: "" },
    { date: `${year}-06-15`, year, description: "仕入", amount: -1_000_000, account: "普通預金", category: "仕入高", income_type: "business", tax_category: "" },
    { date: `${year}-06-15`, year, description: "通信費", amount: -300_000, account: "普通預金", category: "通信費", income_type: "business", tax_category: "" },
    { date: `${year}-06-15`, year, description: "固定資産税", amount: -50_000, account: "普通預金", category: "租税公課", income_type: "business", tax_category: "" },
    { date: `${year}-06-15`, year, description: "会議費", amount: -20_000, account: "普通預金", category: "会議費", income_type: "business", tax_category: "" },
    { date: `${year}-06-15`, year, description: "雑費", amount: -10_000, account: "普通預金", category: "雑費", income_type: "business", tax_category: "" },
    { date: `${year}-06-15`, year, description: "家賃収入", amount: 1_764_000, account: "普通預金", category: "家賃収入", income_type: "real_estate", tax_category: "" },
    { date: `${year}-06-15`, year, description: "修繕費", amount: -100_000, account: "普通預金", category: "修繕費", income_type: "real_estate", tax_category: "" },
    { date: `${year}-06-15`, year, description: "管理費", amount: -60_000, account: "普通預金", category: "管理費", income_type: "real_estate", tax_category: "" },
  ];
  const figures = computeCorrectedFigures(transactions, year, { filingType: "white" });
  const tax = computeIncomeTax({
    year,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year,
    amendment: false,
    submissionDate: "2026-03-10",
    taxpayer: TAXPAYER,
    figures,
    filingType: "white",
    deductionInputs: EMPTY_DEDUCTION_INPUTS,
    miscIncome: EMPTY_MISC_INCOME,
    tax,
    categoryTotals: {
      business: { 仕入高: 1_000_000, 通信費: 300_000, 租税公課: 50_000, 会議費: 20_000, 雑費: 10_000 },
      realEstate: { 家賃収入: 1_764_000, 修繕費: 100_000, 管理費: 60_000 },
    },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
  });
}

function depBsSample(year: number): string {
  const transactions: Transaction[] = [
    { date: `${year}-06-15`, year, description: "事業売上", amount: 12_000_000, account: "普通預金", category: "売上高", income_type: "business", tax_category: "" },
    { date: `${year}-06-15`, year, description: "家賃収入", amount: 1_764_000, account: "普通預金", category: "家賃収入", income_type: "real_estate", tax_category: "" },
  ];
  const figures = computeCorrectedFigures(transactions, year);
  const tax = computeIncomeTax({
    year,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  const depRow = depreciationDetailRow(
    "パソコン",
    {
      acquisitionDate: `${year}-04-01`,
      cost: 600_000,
      usefulLifeYears: 4,
      method: "straight_line",
      businessRatioPercent: 100,
    },
    year,
    "1台",
  );
  const incomeBeforeBlue = figures._detail.business_income_before_deduction;
  return buildXtxFiling({
    year,
    amendment: false,
    submissionDate: "2026-03-10",
    // 半角カナは e-Tax の文字列型で使えないため、生成時に全角へ寄せる
    taxpayer: { ...TAXPAYER, address: `${TAXPAYER.address} ｺｰﾎﾟ尾道101`, shopName: "ﾃｽﾄ商店" },
    figures,
    deductionInputs: EMPTY_DEDUCTION_INPUTS,
    miscIncome: EMPTY_MISC_INCOME,
    tax,
    categoryTotals: { business: {}, realEstate: { 家賃収入: 1_764_000 } },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
    // 不動産所得用（KOA220）の減価償却明細は3ページ目に置く様式
    depreciation: { business: depRow ? [depRow] : [], realEstate: depRow ? [depRow] : [] },
    balanceSheet: {
      opening: { cash: 1_000_000, capital: 1_000_000 },
      closing: { cash: 1_000_000 + incomeBeforeBlue },
      ownerLoan: 0,
      ownerBorrowing: 0,
    },
  });
}

function shohiSample(): string {
  const input = {
    salesIncl10: 15_352_564,
    salesIncl8: 0,
    nontaxableSales: 0,
    exemptSales: 0,
    purchasesIncl10: 4_496_249,
    purchasesIncl8: 0,
    interimNational: 0,
    interimLocal: 0,
  };
  return buildConsumptionXtx({
    taxpayer: TAXPAYER,
    periodFrom: "2025-01-01",
    periodTo: "2025-12-31",
    submissionDate: "2026-11-15",
    filingKind: 1,
    basePeriodSalesThousands: 11_345,
    input,
    result: computeConsumptionReturn(input),
    originalNational: null,
    originalLocal: null,
  });
}

function shohi8Sample(): string {
  // 軽減税率8%の売上・仕入がある本則（AAQ/AAT の税率別内訳の順序を検証）
  const input = {
    salesIncl10: 15_352_564,
    salesIncl8: 5_400_000,
    nontaxableSales: 100_000,
    exemptSales: 0,
    purchasesIncl10: 4_496_249,
    purchasesIncl8: 1_080_000,
    interimNational: 0,
    interimLocal: 0,
  };
  return buildConsumptionXtx({
    taxpayer: TAXPAYER,
    periodFrom: "2025-01-01",
    periodTo: "2025-12-31",
    submissionDate: "2026-11-15",
    filingKind: 1,
    basePeriodSalesThousands: 11_345,
    input,
    result: computeConsumptionReturn(input),
    originalNational: null,
    originalLocal: null,
  });
}

/** 本則・還付の修正申告（AAK00130 に負の値、既確定税額に還付の△を出す） */
function shohiRefundAmendSample(): string {
  const input = {
    salesIncl10: 1_100_000,
    salesIncl8: 0,
    nontaxableSales: 0,
    exemptSales: 0,
    purchasesIncl10: 3_300_000,
    purchasesIncl8: 0,
    interimNational: 0,
    interimLocal: 0,
  };
  return buildConsumptionXtx({
    taxpayer: TAXPAYER,
    periodFrom: "2025-01-01",
    periodTo: "2025-12-31",
    submissionDate: "2026-06-10",
    filingKind: 3,
    basePeriodSalesThousands: 0,
    input,
    result: computeConsumptionReturn(input),
    originalNational: -312_000,
    originalLocal: -88_000,
  });
}

function kanniSample(): string {
  const input = {
    salesByCategory: { 5: { incl10: 16_885_000, incl8: 0 } },
    nontaxableSales: 0,
    exemptSales: 0,
    returnsIncl10: 0,
    returnsIncl8: 0,
    badDebtRecoveryTax10: 0,
    badDebtRecoveryTax8: 0,
    badDebtTax10: 0,
    badDebtTax8: 0,
    interimNational: 0,
    interimLocal: 0,
  };
  return buildSimplifiedConsumptionXtx({
    taxpayer: TAXPAYER,
    periodFrom: "2027-01-01",
    periodTo: "2027-12-31",
    submissionDate: "2028-02-15",
    filingKind: 1,
    basePeriodSales: 12_378_000,
    input,
    result: computeSimplifiedConsumptionReturn(input),
    originalNational: null,
    originalLocal: null,
  });
}

function special20Sample(): string {
  // 返還等・貸倒回収・貸倒れあり（AAJ00030/60/70・AAU・AAV の出力と順序を検証）
  const input = {
    salesIncl10: 11_000_000,
    salesIncl8: 1_080_000,
    nontaxableSales: 0,
    exemptSales: 0,
    returnsIncl10: 110_000,
    returnsIncl8: 0,
    badDebtRecoveryTax10: 7_800,
    badDebtRecoveryTax8: 0,
    badDebtTax10: 3_900,
    badDebtTax8: 0,
    interimNational: 0,
    interimLocal: 0,
  };
  return buildSpecial20ConsumptionXtx({
    taxpayer: TAXPAYER,
    periodFrom: "2025-01-01",
    periodTo: "2025-12-31",
    submissionDate: "2026-11-15",
    filingKind: 1,
    basePeriodSalesThousands: 0,
    input,
    result: computeSpecial20ConsumptionReturn(input),
    originalNational: null,
    originalLocal: null,
  });
}

/** 配当・一時・株式等譲渡あり（第三表＋KOC080 の XSD 検証用） */
function expandedSample(year: number): string {
  const transactions: Transaction[] = [
    { date: `${year}-06-15`, year, description: "事業売上", amount: 12_000_000, account: "普通預金", category: "売上高", income_type: "business", tax_category: "" },
  ];
  const figures = computeCorrectedFigures(transactions, year);
  const expandedIncome: ExpandedIncomeInput = {
    temp: { revenue: 1_500_000, expenses: 300_000 },
    dividend: {
      listedRevenue: 800_000,
      listedTrustRevenue: 0,
      listedWithholding: 122_520,
      listedMode: "separate",
      generalRevenue: 200_000,
      generalTrustRevenue: 0,
      generalWithholding: 40_840,
      interestExpense: 100_000,
    },
    stocks: {
      general: { revenue: 1_000_000, otherRevenue: 0, acquisitionCost: 600_000, transferFees: 0, otherExpenses: 0 },
      listed: { revenue: 500_000, otherRevenue: 0, acquisitionCost: 900_000, transferFees: 0, otherExpenses: 0 },
      listedWithholding: 0,
      specialAccounts: [
        { brokerName: "テスト証券", branchName: "本店", withholdingAccount: true, revenue: 2_000_000, cost: 1_900_000, withholding: 15_315 },
      ],
    },
  };
  const expanded = computeExpandedIncomes(expandedIncome);
  const tax = computeIncomeTax({
    year,
    totalIncome:
      figures._detail.business_income + figures._detail.real_estate_income + expanded.comprehensiveAddition,
    deductions: EMPTY_DEDUCTION_INPUTS,
    taxCredits: resolveTaxCreditInputs({ ...EMPTY_TAX_CREDIT_INPUTS }, expanded),
    separateTaxation: {
      stockIncome: expanded.separateStockIncome,
      dividendIncome: expanded.separateDividendIncome,
    },
  });
  return buildXtxFiling({
    year,
    amendment: false,
    submissionDate: "2026-03-10",
    taxpayer: TAXPAYER,
    figures,
    deductionInputs: EMPTY_DEDUCTION_INPUTS,
    miscIncome: EMPTY_MISC_INCOME,
    expandedIncome,
    tax,
    categoryTotals: { business: {}, realEstate: {} },
    withholdingTax: expandedWithholdingTotal(expanded),
    prepaidTax: 0,
    originalThirdPeriodTax: null,
  });
}

describe("拡張所得ありのXTX構造", () => {
  test("第三表と計算明細書が含まれ、分離区分と主要タグが出る", () => {
    const xml = expandedSample(2025);
    expect(xml).toContain("<KOA020-3");
    expect(xml).toContain("<KOC080 ");
    expect(xml).toContain("<ABA00250><kubun_CD>1</kubun_CD></ABA00250>");
    // 第一表: 配当（総合分）・一時
    expect(xml).toContain("<ABB00070>200000</ABB00070>");
    expect(xml).toContain("<ABB00360>180000</ABB00360>");
    expect(xml).toContain("<ABB00230>1500000</ABB00230>");
    expect(xml).toContain("<ABB00400>350000</ABB00400>");
    // 第三表: 課税株式等（ヲ）40万円・課税配当（ワ）42万円（損失通算後）
    expect(xml).toContain("<ABL00500>400000</ABL00500>");
    expect(xml).toContain("<ABL00505>420000</ABL00505>");
    // 計算明細書: 一般株式等の所得金額・特定口座の明細行
    expect(xml).toContain("<EHD00160>400000</EHD00160>");
    expect(xml).toContain("<EHQ00040>テスト証券</EHQ00040>");
    // 計算明細書1面の上場株式等は特定口座分を含む総額（二重計上しない）
    expect(xml).toContain("<EHD00210>2500000</EHD00210>");
    expect(xml).toContain("<EHD00250>2800000</EHD00250>");
  });

  test("拡張所得がなければ第三表も計算明細書も出ない", () => {
    const xml = incomeSample(2025);
    expect(xml).not.toContain("<KOA020-3");
    expect(xml).not.toContain("<KOC080 ");
    expect(xml).not.toContain("<ABA00250>");
  });
});

describe("公式XMLスキーマ検証", () => {
  maybe("所得税 2023〜2026 と消費税の生成物が公式XSDを通る", () => {
    // 検証は python3 + lxml でサンプル数に応じて数秒かかるため余裕を持たせる
    const dir = mkdtempSync(join(tmpdir(), "xtx-xsd-"));
    const samples: [string, string, string][] = [
      ["shotoku2023.xtx", incomeSample(2023), "shotoku/RKO0010-231.xsd"],
      ["shotoku2024.xtx", incomeSample(2024), "shotoku/RKO0010-240.xsd"],
      ["shotokuFlat2024.xtx", flatReductionSample(), "shotoku/RKO0010-240.xsd"],
      ["shotoku2025.xtx", incomeSample(2025), "shotoku/RKO0010-250.xsd"],
      ["shotokuSpecial2025.xtx", specialRelativeSample(), "shotoku/RKO0010-250.xsd"],
      ["shotokuWhite2025.xtx", whiteSample(2025), "shotoku/RKO0010-250.xsd"],
      ["shotokuSalary2025.xtx", salarySample(2025), "shotoku/RKO0010-250.xsd"],
      ["shotokuDepBs2025.xtx", depBsSample(2025), "shotoku/RKO0010-250.xsd"],
      ["shotokuExpanded2023.xtx", expandedSample(2023), "shotoku/RKO0010-231.xsd"],
      ["shotokuExpanded2024.xtx", expandedSample(2024), "shotoku/RKO0010-240.xsd"],
      ["shotokuExpanded2025.xtx", expandedSample(2025), "shotoku/RKO0010-250.xsd"],
      ["shohi2025.xtx", shohiSample(), "shohi/RSH0010-260.xsd"],
      ["shohi8.xtx", shohi8Sample(), "shohi/RSH0010-260.xsd"],
      ["shohiRefundAmend.xtx", shohiRefundAmendSample(), "shohi/RSH0010-260.xsd"],
      ["shohiSpecial20.xtx", special20Sample(), "shohi/RSH0010-260.xsd"],
      ["shohiKanni2027.xtx", kanniSample(), "shohi/RSH0030-260.xsd"],
    ];
    // 2026年分の所得税XSD（RKO0010-260.xsd）は令和8年9月版の仕様書セット
    // には未収録（令和9年1月受付開始分で公開予定）。ファイルがある場合のみ
    // 検証対象に加える。
    if (existsSync(join(XSD_DIR, "shotoku/RKO0010-260.xsd"))) {
      samples.push(["shotoku2026.xtx", incomeSample(2026), "shotoku/RKO0010-260.xsd"]);
    }
    const args: string[] = [join(import.meta.dir, "../assets/validate-xtx-xsd.py"), XSD_DIR];
    for (const [name, xml, schema] of samples) {
      const path = join(dir, name);
      writeFileSync(path, xml);
      args.push(`${path}:${schema}`);
    }
    const result = spawnSync("python3", args, { encoding: "utf-8" });
    if (result.error) {
      console.log("python3 が使えないためスキップ:", result.error.message);
      return;
    }
    console.log(result.stdout);
    if (result.stderr) console.log(result.stderr);
    expect(result.status).toBe(0);
  }, 30_000);
});
