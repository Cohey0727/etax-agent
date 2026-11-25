/**
 * xtxShohiSpecial20.test.ts — 2割特例の消費税申告（計算＋XTX生成）の検証。
 * 公式 XSD との整合は xtxXsd.test.ts（ETAX_XSD_DIR 設定時）で検証する。
 */
import { describe, expect, test } from "bun:test";
import {
  Special20ConsumptionInput,
  XtxTaxpayer,
  buildSpecial20ConsumptionXtx,
  computeSpecial20ConsumptionReturn,
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

const EMPTY_INPUT: Special20ConsumptionInput = {
  salesIncl10: 0,
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

describe("computeSpecial20ConsumptionReturn", () => {
  test("特別控除税額は基礎税額の80%、納付は売上税額の2割相当になる", () => {
    const r = computeSpecial20ConsumptionReturn({
      ...EMPTY_INPUT,
      salesIncl10: 11_000_000,
    });
    expect(r.outputTax).toBe(780_000);
    expect(r.basis10).toBe(780_000);
    expect(r.specialCredit).toBe(624_000);
    expect(r.diffNational).toBe(156_000);
    expect(r.payableNational).toBe(156_000);
    // 譲渡割額 = 156,000 × 22/78 = 44,000
    expect(r.payableLocal).toBe(44_000);
    expect(r.totalPayable).toBe(200_000);
  });

  test("返還等は基礎税額から引き、小計には戻す", () => {
    const r = computeSpecial20ConsumptionReturn({
      ...EMPTY_INPUT,
      salesIncl10: 11_000_000,
      returnsIncl10: 110_000,
    });
    // 返還税額 110,000×7.8/110 = 7,800。基礎 772,200、特別控除 617,760
    expect(r.returnsTax10).toBe(7_800);
    expect(r.basis10).toBe(772_200);
    expect(r.specialCredit).toBe(617_760);
    expect(r.creditSubtotal).toBe(625_560);
    expect(r.diffNational).toBe(154_400);
  });
});

describe("buildSpecial20ConsumptionXtx", () => {
  test("SHA010（計算方法=8）+ 付表6（SHB070）の組で生成される", () => {
    const input: Special20ConsumptionInput = {
      ...EMPTY_INPUT,
      salesIncl10: 11_000_000,
    };
    const xtx = buildSpecial20ConsumptionXtx({
      taxpayer: TAXPAYER,
      periodFrom: "2025-01-01",
      periodTo: "2025-12-31",
      submissionDate: "2026-02-15",
      filingKind: 1,
      basePeriodSalesThousands: 0,
      input,
      result: computeSpecial20ConsumptionReturn(input),
      originalNational: null,
      originalLocal: null,
    });
    expect(xtx).toContain('<RSH0010 VR="26.0.0"');
    expect(xtx).toContain('<SHA010 VR="10.0"');
    expect(xtx).toContain('<SHB070 VR="1.0"');
    expect(xtx).not.toContain("SHB017");
    expect(xtx).not.toContain("SHB033");
    expect(xtx).toContain("<AAM00020><kubun_CD>8</kubun_CD></AAM00020>");
    expect(xtx).toContain("<AAJ00050>624000</AAJ00050>"); // 特別控除税額
    expect(xtx).toContain("<AYB00080>10000000</AYB00080>"); // 付表6 課税標準額
    expect(xtx).toContain("<AYC00040>624000</AYC00040>"); // 付表6 特別控除税額
  });

  test("返還等・貸倒回収・貸倒れは第一表・第二表の内訳タグに出る", () => {
    const input: Special20ConsumptionInput = {
      ...EMPTY_INPUT,
      salesIncl10: 11_000_000,
      returnsIncl10: 110_000,
      badDebtRecoveryTax10: 7_800,
      badDebtTax10: 3_900,
    };
    const xtx = buildSpecial20ConsumptionXtx({
      taxpayer: TAXPAYER,
      periodFrom: "2025-01-01",
      periodTo: "2025-12-31",
      submissionDate: "2026-02-15",
      filingKind: 1,
      basePeriodSalesThousands: 0,
      input,
      result: computeSpecial20ConsumptionReturn(input),
      originalNational: null,
      originalLocal: null,
    });
    expect(xtx).toContain("<AAJ00030>7800</AAJ00030>"); // 控除過大調整税額（貸倒回収）
    expect(xtx).toContain("<AAJ00060>7800</AAJ00060>"); // 返還等対価に係る税額
    expect(xtx).toContain("<AAJ00070>3900</AAJ00070>"); // 貸倒れに係る税額
    expect(xtx).toContain("<AAU00000>7800</AAU00000>"); // 第二表 返還等対価に係る税額
    expect(xtx).toContain("<AAV00010>7800</AAV00010>"); // 第二表 売上げの返還等の内訳
  });

  test("適用期間（2023-10-01〜2026-09-30）と重ならない課税期間は例外", () => {
    const input: Special20ConsumptionInput = { ...EMPTY_INPUT, salesIncl10: 11_000_000 };
    expect(() =>
      buildSpecial20ConsumptionXtx({
        taxpayer: TAXPAYER,
        periodFrom: "2027-01-01",
        periodTo: "2027-12-31",
        submissionDate: "2028-02-15",
        filingKind: 1,
        basePeriodSalesThousands: 0,
        input,
        result: computeSpecial20ConsumptionReturn(input),
        originalNational: null,
        originalLocal: null,
      }),
    ).toThrow(/2割特例/);
  });
});
