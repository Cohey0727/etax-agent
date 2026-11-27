/**
 * deductionStorageAgriculture.test.ts — 申告入力の農業所得の
 * 保存・復元の検証。
 *
 * 担保すること:
 * - 保存値の agriculture が parseDeductionState で保持される
 * - 壊れた値（数値でない科目・文字列の金額）でも落ちず正規化される
 * - agriculture を含まない保存値でも空の農業入力にフォールバックする
 * - エージェントの部分パッチ（applyDeductionPatch）が農業へ適用される
 */
import { describe, expect, test } from "bun:test";
import { applyDeductionPatch, freshDeductionState, parseDeductionState } from "@etax/shared";

const AGRICULTURE = {
  farmName: "テスト農園",
  salesAmount: 3_000_000,
  householdConsumption: 120_000,
  miscRevenue: 30_000,
  produceOpeningInventory: 100_000,
  produceClosingInventory: 150_000,
  otherOpeningInventory: 40_000,
  otherClosingInventory: 60_000,
  expenseTotals: { 肥料費: 400_000, 雑費: 20_000 },
  familyWorkerSalary: 600_000,
  familyWorkerDeduction: 860_000,
  badDebtProvisionIn: 15_000,
  badDebtProvisionBack: 5_000,
  cultivationCostDeduction: 80_000,
  beefCattleExemptionAmount: 0,
};

describe("deductionStorage（農業所得）", () => {
  test("保存値の agriculture がそのまま復元される", () => {
    const state = parseDeductionState({ agriculture: AGRICULTURE });
    expect(state.agriculture.farmName).toBe("テスト農園");
    expect(state.agriculture.salesAmount).toBe(3_000_000);
    expect(state.agriculture.expenseTotals).toEqual({ 肥料費: 400_000, 雑費: 20_000 });
  });

  test("壊れた値でも落ちず、数値でない科目は落ちる", () => {
    const broken = {
      agriculture: {
        ...AGRICULTURE,
        salesAmount: "abc",
        expenseTotals: { 肥料費: "400000", 種苗費: 50_000 },
      },
    } as unknown as Parameters<typeof parseDeductionState>[0];
    const state = parseDeductionState(broken);
    expect(state.agriculture.salesAmount).toBe(0);
    expect(state.agriculture.expenseTotals).toEqual({ 種苗費: 50_000 });
  });

  test("agriculture を含まない保存値は空の農業入力になる", () => {
    const state = parseDeductionState({});
    expect(state.agriculture.salesAmount).toBe(0);
    expect(state.agriculture.expenseTotals).toEqual({});
    expect(freshDeductionState().agriculture.farmName).toBe("");
  });

  test("部分パッチで農業だけが更新される", () => {
    const base = freshDeductionState();
    const next = applyDeductionPatch(base, {
      agriculture: { salesAmount: 100_000, expenseTotals: { 肥料費: 10_000 } },
    });
    expect(next.agriculture.salesAmount).toBe(100_000);
    expect(next.agriculture.expenseTotals).toEqual({ 肥料費: 10_000 });
    expect(next.agriculture.farmName).toBe("");
  });
});
