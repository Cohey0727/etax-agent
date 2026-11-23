/**
 * depreciation.test.ts — 減価償却エンジンの検証。
 * 期待値は別表第八・第十の率と手計算（設例）で裏取りした値。
 */
import { describe, expect, test } from "bun:test";
import {
  FixedAssetInput,
  decliningBalanceRates,
  depreciationForYear,
  depreciationSchedule,
  smallSpecialUsage,
  straightLineRate,
} from "../src/depreciation";

function asset(partial: Partial<FixedAssetInput>): FixedAssetInput {
  return {
    acquisitionDate: "2025-01-10",
    cost: 1_000_000,
    usefulLifeYears: 5,
    method: "straight_line",
    businessRatioPercent: 100,
    ...partial,
  };
}

describe("償却率表", () => {
  test("定額法の償却率は別表第八（1/年の切り上げ）", () => {
    expect(straightLineRate(4)).toBe(0.25);
    expect(straightLineRate(5)).toBe(0.2);
    expect(straightLineRate(6)).toBe(0.167);
    expect(straightLineRate(8)).toBe(0.125);
    expect(straightLineRate(10)).toBe(0.1);
    expect(straightLineRate(15)).toBe(0.067);
  });

  test("定率法の率は別表第十（200%）", () => {
    expect(decliningBalanceRates(5)).toEqual({ rate: 0.4, revisedRate: 0.5, guaranteeRate: 0.108 });
    expect(decliningBalanceRates(6)).toEqual({ rate: 0.333, revisedRate: 0.334, guaranteeRate: 0.09911 });
    expect(decliningBalanceRates(10)).toEqual({ rate: 0.2, revisedRate: 0.25, guaranteeRate: 0.06552 });
    // 2026-11-23 に別表第十（e-Gov原文＋2ソース照合）から転記した範囲
    expect(decliningBalanceRates(16)).toEqual({ rate: 0.125, revisedRate: 0.143, guaranteeRate: 0.04294 });
    expect(decliningBalanceRates(19)).toEqual({ rate: 0.105, revisedRate: 0.112, guaranteeRate: 0.03693 });
    expect(decliningBalanceRates(28)).toEqual({ rate: 0.071, revisedRate: 0.072, guaranteeRate: 0.02568 });
    expect(decliningBalanceRates(50)).toEqual({ rate: 0.04, revisedRate: 0.042, guaranteeRate: 0.0144 });
    expect(decliningBalanceRates(100)).toEqual({ rate: 0.02, revisedRate: 0.02, guaranteeRate: 0.00742 });
  });

  test("率表に無い年数の定率法は例外（推測しない）", () => {
    expect(() => decliningBalanceRates(101)).toThrow();
    expect(() => decliningBalanceRates(1)).toThrow();
  });
});

describe("定額法", () => {
  test("5年・期首供用: 毎年同額、最終年は残高1円で止まる", () => {
    const schedule = depreciationSchedule(asset({}), 2030);
    expect(schedule.map((y) => y.ordinary)).toEqual([200_000, 200_000, 200_000, 200_000, 199_999]);
    expect(schedule[schedule.length - 1].closingBookValue).toBe(1);
    expect(schedule[schedule.length - 1].year).toBe(2029);
  });

  test("期中供用は初年度だけ月割（7月供用=6か月）", () => {
    const a = asset({ acquisitionDate: "2025-07-01" });
    const y2025 = depreciationForYear(a, 2025);
    expect(y2025?.months).toBe(6);
    expect(y2025?.ordinary).toBe(100_000);
    expect(depreciationForYear(a, 2026)?.ordinary).toBe(200_000);
  });

  test("事業専用割合で算入額を按分する", () => {
    const a = asset({ businessRatioPercent: 50 });
    expect(depreciationForYear(a, 2025)?.deductible).toBe(100_000);
  });
});

describe("定率法（200%）", () => {
  test("300万円・5年: 保証額を下回った年から改定償却率に切り替わる", () => {
    const a = asset({ cost: 3_000_000, method: "declining_balance" });
    const schedule = depreciationSchedule(a, 2030);
    // 償却保証額 = 3,000,000 × 0.10800 = 324,000
    expect(schedule[0].guaranteeAmount).toBe(324_000);
    expect(schedule.map((y) => y.ordinary)).toEqual([
      1_200_000, // 3,000,000 × 0.400
      720_000, // 1,800,000 × 0.400
      432_000, // 1,080,000 × 0.400
      324_000, // 調整前 648,000×0.400=259,200 < 324,000 → 改定 648,000 × 0.500
      323_999, // 最終年は残高1円に調整
    ]);
    expect(schedule[3].rate).toBe(0.5);
    expect(schedule[3].basisAmount).toBe(648_000);
    expect(schedule[schedule.length - 1].closingBookValue).toBe(1);
  });

  test("期中供用の初年度は調整前償却額を月割する", () => {
    const a = asset({ cost: 3_000_000, method: "declining_balance", acquisitionDate: "2025-10-01" });
    const y2025 = depreciationForYear(a, 2025);
    expect(y2025?.months).toBe(3);
    expect(y2025?.ordinary).toBe(300_000); // 1,200,000 × 3/12
  });
});

describe("一括償却資産・少額特例", () => {
  test("一括償却は月割なしで3年均等、端数は3年目", () => {
    const a = asset({ cost: 100_000, method: "lump_sum", acquisitionDate: "2025-11-01" });
    const schedule = depreciationSchedule(a, 2030);
    expect(schedule.map((y) => y.ordinary)).toEqual([33_333, 33_333, 33_334]);
    expect(schedule[0].months).toBe(2); // 供用月数は記録するが計算は月割しない
  });

  test("少額特例は取得年に全額、残高0", () => {
    const a = asset({ cost: 250_000, method: "small_special" });
    const y = depreciationForYear(a, 2025);
    expect(y?.ordinary).toBe(250_000);
    expect(y?.closingBookValue).toBe(0);
    expect(depreciationForYear(a, 2026)).toBeNull();
  });

  test("少額特例の年間上限300万円の超過判定", () => {
    const assets = [
      asset({ cost: 2_000_000, method: "small_special" }),
      asset({ cost: 1_500_000, method: "small_special" }),
      asset({ cost: 900_000, method: "straight_line" }),
    ];
    const usage = smallSpecialUsage(assets, 2025);
    expect(usage.total).toBe(3_500_000);
    expect(usage.exceeded).toBe(true);
    expect(smallSpecialUsage(assets, 2026).total).toBe(0);
  });
});
