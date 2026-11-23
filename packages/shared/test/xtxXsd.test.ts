/**
 * xtxXsd.test.ts — 生成 XTX の公式 XML スキーマ検証（任意・環境変数ゲート）。
 *
 * 環境変数 ETAX_XSD_DIR に e-Tax 仕様書「19 XMLスキーマ」を展開した
 * 「19XMLスキーマ」フォルダのパスを設定したときだけ実行する（未設定なら
 * スキップ）。検証には python3 + lxml が必要。
 *
 * 2026-11-19、WEB版「作成済みデータの利用」で SE00S170 になった原因は
 * この検証で特定した（手続VR・名前空間・IT部の必須要素と並び順・
 * zeimusho の表記）。構造面の常時チェックは xtx.test.ts /
 * xtxShohi.test.ts 側にある。
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
  Transaction,
  XtxTaxpayer,
  buildConsumptionXtx,
  buildSimplifiedConsumptionXtx,
  buildSpecial20ConsumptionXtx,
  buildXtxFiling,
  computeConsumptionReturn,
  computeCorrectedFigures,
  computeIncomeTax,
  computeSimplifiedConsumptionReturn,
  computeSpecial20ConsumptionReturn,
} from "../src";

const XSD_DIR = process.env.ETAX_XSD_DIR ?? "";
const maybe = XSD_DIR ? test : test.skip;

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
  const input = {
    salesIncl10: 15_352_564,
    salesIncl8: 0,
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

describe("公式XMLスキーマ検証（ETAX_XSD_DIR 設定時のみ）", () => {
  maybe("所得税 2023〜2026 と消費税の生成物が公式XSDを通る", () => {
    const dir = mkdtempSync(join(tmpdir(), "xtx-xsd-"));
    const samples: [string, string, string][] = [
      ["shotoku2023.xtx", incomeSample(2023), "shotoku/RKO0010-231.xsd"],
      ["shotoku2024.xtx", incomeSample(2024), "shotoku/RKO0010-240.xsd"],
      ["shotoku2025.xtx", incomeSample(2025), "shotoku/RKO0010-250.xsd"],
      ["shohi2025.xtx", shohiSample(), "shohi/RSH0010-260.xsd"],
      ["shohiSpecial20.xtx", special20Sample(), "shohi/RSH0010-260.xsd"],
      ["shohiKanni2027.xtx", kanniSample(), "shohi/RSH0030-260.xsd"],
    ];
    // 2026年分の所得税XSD（RKO0010-260.xsd）は令和8年9月版の仕様書セット
    // には未収録（令和9年1月受付開始分で公開予定）。ファイルがある場合のみ
    // 検証対象に加える。
    if (existsSync(join(XSD_DIR, "shotoku/RKO0010-260.xsd"))) {
      samples.push(["shotoku2026.xtx", incomeSample(2026), "shotoku/RKO0010-260.xsd"]);
    }
    const args: string[] = [join(import.meta.dir, "validate-xtx-xsd.py"), XSD_DIR];
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
  });
});
