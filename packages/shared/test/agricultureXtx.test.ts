/**
 * agricultureXtx.test.ts — 農業所得（Issue #24 Phase 1）の XTX 生成の検証。
 *
 * 担保すること:
 * - 青色では青色申告決算書（農業所得用）KOA240、白色では収支内訳書
 *   （農業所得用）KOA120 が添付され、様式の金額チェーンが一致する
 * - 申告書（KOA020）の事業欄に農業の収入金額（ABB00040）と
 *   所得金額（ABB00320）が出る
 * - 農業が無い場合は農業様式も農業欄も出ない（従来どおり）
 * - 農業のみ（一般事業なし）でも農業様式と申告書の農業欄が出る
 * - 農業の減価償却明細が KOA240-3 / KOA120-2 に出る
 */
import { describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  buildXtxFiling,
  computeAgricultureStatement,
  computeCorrectedFigures,
  computeIncomeTax,
} from "../src";
import type { AgricultureInput, Transaction, XtxFilingData } from "../src";

const AGRICULTURE: AgricultureInput = {
  farmName: "テスト農園",
  salesAmount: 3_000_000,
  householdConsumption: 120_000,
  miscRevenue: 30_000,
  produceOpeningInventory: 100_000,
  produceClosingInventory: 150_000,
  otherOpeningInventory: 40_000,
  otherClosingInventory: 60_000,
  expenseTotals: {
    肥料費: 400_000,
    減価償却費: 200_000,
    雇人費: 500_000,
    地代賃借料: 240_000,
    貸倒金: 10_000,
    雑費: 20_000,
  },
  familyWorkerSalary: 600_000,
  familyWorkerDeduction: 860_000,
  badDebtProvisionIn: 15_000,
  badDebtProvisionBack: 5_000,
  cultivationCostDeduction: 80_000,
  beefCattleExemptionAmount: 0,
};

const BUSINESS_TX: Transaction[] = [
  {
    date: "2025-06-15",
    year: 2025,
    description: "事業売上",
    amount: 1_000_000,
    account: "普通預金",
    category: "売上高",
    income_type: "business",
    tax_category: "",
  },
];

function buildFiling(options: {
  filingType?: "blue65" | "white";
  withAgriculture?: boolean;
  withBusiness?: boolean;
  withDepreciation?: boolean;
}): string {
  const filingType = options.filingType ?? "blue65";
  const withAgriculture = options.withAgriculture ?? true;
  const transactions = options.withBusiness === false ? [] : BUSINESS_TX;
  const figures = computeCorrectedFigures(transactions, 2025, {
    filingType,
    agriculture: withAgriculture ? AGRICULTURE : undefined,
  });
  const tax = computeIncomeTax({
    year: 2025,
    totalIncome:
      figures._detail.business_income +
      figures._detail.real_estate_income +
      figures._detail.agriculture_income,
    deductions: { ...EMPTY_DEDUCTION_INPUTS },
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  const statement = computeAgricultureStatement(AGRICULTURE);
  const data: XtxFilingData = {
    year: 2025,
    amendment: false,
    submissionDate: "2026-03-10",
    taxpayer: {
      name: "テスト太郎",
      nameKana: "テストタロウ",
      zipCode: "1000001",
      address: "東京都千代田区霞が関一丁目1番1号",
      addressLine2: "",
      birthDate: "1980-04-01",
      phone: "090-0000-0000",
      taxOfficeName: "麹町",
      taxOfficeCode: "01101",
      myNumber: "",
      userId: "1234567890123456",
      occupation: "農業",
      shopName: "",
      jan1Address: "",
    },
    figures,
    filingType,
    miscIncome: EMPTY_MISC_INCOME,
    deductionInputs: { ...EMPTY_DEDUCTION_INPUTS },
    tax,
    categoryTotals: {
      business: { 売上高: 1_000_000 },
      realEstate: {},
    },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
    agriculture: withAgriculture
      ? { statement, blueDeduction: figures._detail.blue_deduction_agriculture }
      : undefined,
    depreciation: options.withDepreciation
      ? {
          business: [],
          realEstate: [],
          agriculture: [
            {
              name: "トラクター",
              quantity: "1台",
              acquisitionYearMonth: "2023-04",
              cost: 2_000_000,
              guaranteeAmount: null,
              basisAmount: 2_000_000,
              method: "straight_line" as const,
              methodLabel: "定額法",
              usefulLifeYears: 7,
              rate: 0.143,
              months: 12,
              ordinary: 200_000,
              total: 200_000,
              businessRatioPercent: 100,
              deductible: 200_000,
              closingBookValue: 1_800_000,
            },
          ],
        }
      : undefined,
  };
  return buildXtxFiling(data);
}

describe("農業所得のXTX生成", () => {
  test("青色では KOA240 が添付され、金額チェーンが様式どおりになる", () => {
    const xtx = buildFiling({});
    expect(xtx).toContain('<KOA240 VR="8.0"');
    expect(xtx).toContain("<rdf:li>KOA240</rdf:li>");
    expect(xtx).toContain("<APB00060>テスト農園</APB00060>");
    // 収入金額: 販売 3,000,000 + 家事消費 120,000 + 雑収入 30,000 = 小計 3,150,000
    expect(xtx).toContain("<APF00110>3000000</APF00110>");
    expect(xtx).toContain("<APF00140>3150000</APF00140>");
    // 計 = 小計 + 農産物期首 100,000 − 期末 150,000 = 3,100,000
    expect(xtx).toContain("<APF00180>3100000</APF00180>");
    // 経費: 肥料費・減価償却費・雇人費・地代賃借料は固定行、貸倒金は追加科目
    expect(xtx).toContain("<APF00230>400000</APF00230>");
    expect(xtx).toContain("<APF00340>500000</APF00340>");
    expect(xtx).toContain(
      "<APF00375><APF00060>貸倒金</APF00060><APF00380>10000</APF00380></APF00375>",
    );
    // 経費小計 1,370,000、計 = 小計 + 期首 40,000 − 期末 60,000 − 育成費用 80,000
    expect(xtx).toContain("<APF00400>1370000</APF00400>");
    expect(xtx).toContain("<APF00450>1270000</APF00450>");
    expect(xtx).toContain("<APF00460>1830000</APF00460>");
    // 控除前所得 = 差引 1,830,000 + 繰戻 5,000 − 繰入 615,000 = 1,220,000
    expect(xtx).toContain("<APF00570>1220000</APF00570>");
    // 青色申告特別控除は事業（控除前 1,000,000）に先に配分され農業は0
    expect(xtx).not.toContain("<APF00580>");
    expect(xtx).toContain("<APF00600>1220000</APF00600>");
  });

  test("申告書（KOA020）の事業欄に農業の収入金額と所得金額が出る", () => {
    const xtx = buildFiling({});
    expect(xtx).toContain("<ABB00040>3100000</ABB00040>");
    expect(xtx).toContain("<ABB00320>1220000</ABB00320>");
    // 一般事業の行も従来どおり出る
    expect(xtx).toContain("<ABB00030>1000000</ABB00030>");
    expect(xtx).toContain("<ABB00300>350000</ABB00300>");
  });

  test("白色では KOA120 が添付され、専従者控除後の所得金額になる", () => {
    const xtx = buildFiling({ filingType: "white" });
    expect(xtx).toContain('<KOA120 VR="9.0"');
    expect(xtx).not.toContain("<KOA240");
    // 雇人費は先頭の独立行、地代賃借料は「小作料・賃借料」行
    expect(xtx).toContain("<AJG00120>500000</AJG00120>");
    expect(xtx).toContain("<AJG00130>240000</AJG00130>");
    // 貸倒金も先頭の独立行（白色では固定行）
    expect(xtx).toContain("<AJG00150>10000</AJG00150>");
    // その他の経費の小計 = 肥料費 400,000 + 雑費 20,000
    //   + 期首 40,000 − 期末 60,000 − 育成費用 80,000 = 320,000
    expect(xtx).toContain("<AJG00380>320000</AJG00380>");
    // 経費計 = 先頭行 950,000 + その他 320,000 = 1,270,000
    // （科目合計 1,370,000 + 棚卸・育成費用の調整 −100,000 と一致）
    expect(xtx).toContain("<AJG00390>1270000</AJG00390>");
    // 専従者控除前 1,830,000 − 専従者控除 860,000 = 所得金額 970,000
    expect(xtx).toContain("<AJG00400>1830000</AJG00400>");
    expect(xtx).toContain("<AJG00410>860000</AJG00410>");
    expect(xtx).toContain("<AJG00430>970000</AJG00430>");
    expect(xtx).toContain("<ABB00320>970000</ABB00320>");
  });

  test("農業が無い場合は農業様式も農業欄も出ない", () => {
    const xtx = buildFiling({ withAgriculture: false });
    expect(xtx).not.toContain("KOA240");
    expect(xtx).not.toContain("KOA120");
    expect(xtx).not.toContain("ABB00040");
    expect(xtx).not.toContain("ABB00320");
  });

  test("農業のみ（一般事業なし）でも農業様式と申告書の農業欄が出る", () => {
    const xtx = buildFiling({ withBusiness: false });
    expect(xtx).toContain('<KOA240 VR="8.0"');
    expect(xtx).toContain("<ABB00040>3100000</ABB00040>");
    // 農業のみの場合、青色申告特別控除は農業に配分される（65万円）
    expect(xtx).toContain("<APF00580>650000</APF00580>");
    expect(xtx).toContain("<APF00600>570000</APF00600>");
    expect(xtx).toContain("<ABB00320>570000</ABB00320>");
    // 営業等の行は出ない
    expect(xtx).not.toContain("ABB00030");
    expect(xtx).not.toContain("ABB00300");
  });

  test("農業の減価償却明細が KOA240-3 に出る", () => {
    const xtx = buildFiling({ withDepreciation: true });
    expect(xtx).toContain('<KOA240-3 page="3">');
    expect(xtx).toContain("<APF02050>トラクター</APF02050>");
    expect(xtx).toContain("<APF02210>200000</APF02210>");
  });

  test("白色で農業の減価償却明細が KOA120-2 に出る", () => {
    const xtx = buildFiling({ filingType: "white", withDepreciation: true });
    expect(xtx).toContain('<KOA120-2 page="2">');
    expect(xtx).toContain("<AJL00020>トラクター</AJL00020>");
  });
});
