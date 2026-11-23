/**
 * xtxShohiKanni.test.ts — 簡易課税の消費税申告（計算＋XTX生成）の検証。
 *
 * 計算の期待値は国税庁の設例（付表4-3・5-3の手順）で手計算したもの。
 * 公式 XSD との整合は xtxXsd.test.ts（ETAX_XSD_DIR 設定時）で検証する。
 */
import { describe, expect, test } from "bun:test";
import {
  SimplifiedConsumptionInput,
  XtxTaxpayer,
  buildSimplifiedConsumptionXtx,
  computeSimplifiedConsumptionReturn,
} from "../src";

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

const EMPTY_INPUT: SimplifiedConsumptionInput = {
  salesByCategory: {},
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

describe("computeSimplifiedConsumptionReturn", () => {
  test("単一事業（第5種・サービス業）は専業者計算: 基礎税額 × 50%", () => {
    const r = computeSimplifiedConsumptionReturn({
      ...EMPTY_INPUT,
      salesByCategory: { 5: { incl10: 11_000_000, incl8: 0 } },
    });
    expect(r.singleCategory).toBe(5);
    expect(r.salesExcl10).toBe(10_000_000);
    expect(r.taxBase).toBe(10_000_000);
    expect(r.outputTax).toBe(780_000);
    expect(r.basis10).toBe(780_000);
    expect(r.inputTax).toBe(390_000);
    expect(r.diffNational).toBe(390_000);
    expect(r.payableNational).toBe(390_000);
    // 譲渡割額 = 390,000 × 22/78 = 110,000
    expect(r.localTaxGross).toBe(110_000);
    expect(r.payableLocal).toBe(110_000);
    expect(r.totalPayable).toBe(500_000);
  });

  test("複数事業は原則計算: 区分別税額×みなし率を基礎税額の比率で按分", () => {
    const r = computeSimplifiedConsumptionReturn({
      ...EMPTY_INPUT,
      salesByCategory: {
        2: { incl10: 1_100_000, incl8: 0 },
        5: { incl10: 550_000, incl8: 0 },
      },
    });
    expect(r.singleCategory).toBeNull();
    // 区分別税額: 第2種 78,000 / 第5種 39,000、基礎税額 117,000
    // 原則按分前: 78,000×0.8 + 39,000×0.5 = 81,900、按分後も 81,900
    expect(r.principleRaw10).toBe(81_900);
    expect(r.inputTax).toBe(81_900);
    expect(r.diffNational).toBe(35_100);
    const cat2 = r.categories.find((c) => c.category === 2);
    const cat5 = r.categories.find((c) => c.category === 5);
    expect(cat2?.sharePercent).toBe(66.6);
    expect(cat5?.sharePercent).toBe(33.3);
  });

  test("軽減税率と返還等: 返還税額は基礎税額と小計の両方に効く", () => {
    const r = computeSimplifiedConsumptionReturn({
      ...EMPTY_INPUT,
      salesByCategory: { 5: { incl10: 1_100_000, incl8: 1_080_000 } },
      returnsIncl8: 108_000,
    });
    // 8%分: 売上税額 62,400、返還税額 108,000×6.24/108 = 6,240
    expect(r.returnsTax8).toBe(6_240);
    expect(r.basis8).toBe(56_160);
    expect(r.inputTax8).toBe(28_080);
    expect(r.inputTax10).toBe(39_000);
    expect(r.creditSubtotal).toBe(73_320);
    expect(r.diffNational).toBe(67_000);
    expect(r.payableLocal).toBe(18_800);
    expect(r.totalPayable).toBe(85_800);
  });

  test("中間納付がある場合は納付税額から差し引く", () => {
    const r = computeSimplifiedConsumptionReturn({
      ...EMPTY_INPUT,
      salesByCategory: { 5: { incl10: 11_000_000, incl8: 0 } },
      interimNational: 100_000,
      interimLocal: 28_200,
    });
    expect(r.payableNational).toBe(290_000);
    expect(r.payableLocal).toBe(81_800);
    expect(r.totalPayable).toBe(371_800);
  });
});

describe("buildSimplifiedConsumptionXtx", () => {
  function buildSingle() {
    const input: SimplifiedConsumptionInput = {
      ...EMPTY_INPUT,
      salesByCategory: { 5: { incl10: 11_000_000, incl8: 0 } },
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

  test("手続・様式の組（RSH0030 + SHA020 9.0 + SHB047/SHB067 1.0）", () => {
    const xtx = buildSingle();
    expect(xtx).toContain('<RSH0030 VR="26.0.0"');
    expect(xtx).toContain("<procedure_CD>RSH0030</procedure_CD>");
    expect(xtx).toContain('<SHA020 VR="9.0"');
    expect(xtx).toContain('<SHB047 VR="1.0"');
    expect(xtx).toContain('<SHB067 VR="1.0"');
    expect(xtx).toContain("<rdf:li>SHA020</rdf:li>");
    expect(xtx).toContain("<rdf:li>SHB047</rdf:li>");
    expect(xtx).toContain("<rdf:li>SHB067</rdf:li>");
  });

  test("申告書・付表に主要金額が転記される", () => {
    const xtx = buildSingle();
    expect(xtx).toContain("<ABI00010>10000000</ABI00010>"); // 課税標準額
    expect(xtx).toContain("<ABI00020>780000</ABI00020>"); // 消費税額
    expect(xtx).toContain("<ABI00050>390000</ABI00050>"); // 控除対象仕入税額
    expect(xtx).toContain("<ABI00120>390000</ABI00120>"); // 納付税額
    expect(xtx).toContain("<ABI00180>12378000</ABI00180>"); // 基準期間の課税売上高（円）
    expect(xtx).toContain("<DUB00030>10000000</DUB00030>"); // 付表4-3 課税標準額
    expect(xtx).toContain("<DUF00040>390000</DUF00040>"); // 付表4-3 控除対象仕入税額
    // 専業者欄: 第5種 = 区分5（50%）
    expect(xtx).toContain("<DVC00010><kubun_CD>5</kubun_CD></DVC00010>");
    expect(xtx).toContain("<DVC00040>390000</DVC00040>");
    expect(xtx).toContain("<DVE00750>390000</DVE00750>"); // 選択した控除対象仕入税額
    // 参考事項: 第5種の課税売上高 10,000（千円）・割合 100.0
    expect(xtx).toContain("<ABL00160>10000</ABL00160>");
    expect(xtx).toContain("<ABL00170>100.0</ABL00170>");
  });

  test("複数事業では明細（DVD）と原則計算（DVE）が出て専業者欄は出ない", () => {
    const input: SimplifiedConsumptionInput = {
      ...EMPTY_INPUT,
      salesByCategory: {
        2: { incl10: 1_100_000, incl8: 0 },
        5: { incl10: 550_000, incl8: 0 },
      },
    };
    const xtx = buildSimplifiedConsumptionXtx({
      taxpayer: TAXPAYER,
      periodFrom: "2027-01-01",
      periodTo: "2027-12-31",
      submissionDate: "2028-02-15",
      filingKind: 1,
      basePeriodSales: 0,
      input,
      result: computeSimplifiedConsumptionReturn(input),
      originalNational: null,
      originalLocal: null,
    });
    expect(xtx).not.toContain("DVC00000");
    expect(xtx).toContain("<DVD00160>1000000</DVD00160>"); // 第2種 税抜売上
    expect(xtx).toContain("<DVD00170>66.6</DVD00170>");
    expect(xtx).toContain("<DVE00040>81900</DVE00040>"); // 原則計算の按分前
    expect(xtx).toContain("<DVE00750>81900</DVE00750>");
  });

  test("修正申告では既確定税額との差額欄が出る", () => {
    const input: SimplifiedConsumptionInput = {
      ...EMPTY_INPUT,
      salesByCategory: { 5: { incl10: 11_000_000, incl8: 0 } },
    };
    const xtx = buildSimplifiedConsumptionXtx({
      taxpayer: TAXPAYER,
      periodFrom: "2027-01-01",
      periodTo: "2027-12-31",
      submissionDate: "2028-05-15",
      filingKind: 3,
      basePeriodSales: 12_378_000,
      input,
      result: computeSimplifiedConsumptionReturn(input),
      originalNational: 300_000,
      originalLocal: 84_600,
    });
    expect(xtx).toContain("<ABI00150>300000</ABI00150>");
    expect(xtx).toContain("<ABI00160>90000</ABI00160>"); // 390,000 - 300,000
    expect(xtx).toContain("<ABJ00110>84600</ABJ00110>");
    expect(xtx).toContain("<ABJ00130>115400</ABJ00130>"); // 90,000 + 25,400
  });
});
