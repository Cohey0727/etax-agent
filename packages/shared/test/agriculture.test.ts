/**
 * agriculture.test.ts — 農業所得（Issue #24 Phase 1）の決定的計算の検証。
 *
 * 計算チェーンは青色申告決算書（農業所得用）KOA240・収支内訳書
 * （農業所得用）KOA120 の様式どおり:
 *   収入金額の計 = 小計 + 農産物期首棚卸 − 農産物期末棚卸
 *   経費計 = 科目合計 + 農産物以外期首棚卸 − 農産物以外期末棚卸 − 育成費用
 *   青色の特別控除前所得 = 差引金額 + 繰戻額等 − 繰入額等
 *   白色の所得金額 = 差引金額 − 専従者控除
 */
import { describe, expect, test } from "bun:test";
import {
  agricultureFromWire,
  agricultureIncomeBeforeBlueDeduction,
  agricultureToWire,
  computeAgricultureStatement,
  isAgricultureEmpty,
  normalizeAgricultureInput,
} from "../src/agriculture";
import type { AgricultureInput } from "../src/agriculture";

const BASE: AgricultureInput = {
  farmName: "テスト農園",
  salesAmount: 3_000_000,
  householdConsumption: 120_000,
  miscRevenue: 30_000,
  produceOpeningInventory: 100_000,
  produceClosingInventory: 150_000,
  otherOpeningInventory: 40_000,
  otherClosingInventory: 60_000,
  expenseTotals: {
    租税公課: 50_000,
    肥料費: 400_000,
    飼料費: 300_000,
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

describe("computeAgricultureStatement", () => {
  test("収入金額の計は棚卸（農産物）で調整される", () => {
    const stmt = computeAgricultureStatement(BASE);
    expect(stmt.revenueSubtotal).toBe(3_150_000);
    expect(stmt.revenueTotal).toBe(3_100_000);
  });

  test("経費計は棚卸（農産物以外）と育成費用で調整される", () => {
    const stmt = computeAgricultureStatement(BASE);
    expect(stmt.expensesSubtotal).toBe(1_720_000);
    expect(stmt.expensesTotal).toBe(1_720_000 + 40_000 - 60_000 - 80_000);
    expect(stmt.balanceAmount).toBe(3_100_000 - 1_620_000);
  });

  test("青色の特別控除前所得は繰戻・繰入を反映する", () => {
    const stmt = computeAgricultureStatement(BASE);
    expect(stmt.provisionInTotal).toBe(615_000);
    expect(stmt.provisionBackTotal).toBe(5_000);
    expect(agricultureIncomeBeforeBlueDeduction(stmt, false)).toBe(
      1_480_000 + 5_000 - 615_000,
    );
  });

  test("白色の所得金額は専従者控除を差し引く", () => {
    const stmt = computeAgricultureStatement(BASE);
    expect(agricultureIncomeBeforeBlueDeduction(stmt, true)).toBe(
      1_480_000 - 860_000,
    );
  });

  test("青色の固定行は様式の並び順で、貸倒金は追加科目になる", () => {
    const stmt = computeAgricultureStatement(BASE);
    expect(stmt.blueExpenseRows.map((r) => r.category)).toEqual([
      "租税公課",
      "肥料費",
      "飼料費",
      "減価償却費",
      "雇人費",
      "地代賃借料",
    ]);
    expect(stmt.blueExtraExpenses).toEqual([{ category: "貸倒金", amount: 10_000 }]);
    expect(stmt.blueMiscExpense).toBe(20_000);
  });

  test("白色は雇人費・地代賃借料・減価償却費・貸倒金・利子割引料が先頭の独立行になる", () => {
    const stmt = computeAgricultureStatement(BASE);
    expect(stmt.whiteTopExpenseRows.map((r) => r.category)).toEqual([
      "雇人費",
      "地代賃借料",
      "減価償却費",
      "貸倒金",
    ]);
    expect(stmt.whiteOtherExpenseRows.map((r) => r.category)).toEqual([
      "租税公課",
      "肥料費",
      "飼料費",
    ]);
    // その他の経費の小計 = 固定行 + 雑費 + 棚卸調整 − 育成費用
    expect(stmt.whiteOtherExpensesSubtotal).toBe(
      50_000 + 400_000 + 300_000 + 20_000 + 40_000 - 60_000 - 80_000,
    );
    // 白色の経費計は青色の経費計と一致する（科目の置き場所が違うだけ）
    expect(
      stmt.whiteTopExpenseRows.reduce((s, r) => s + r.amount, 0) +
        stmt.whiteOtherExpensesSubtotal,
    ).toBe(stmt.expensesTotal);
  });

  test("追加科目が5件以上ある場合は金額順に4件まで、超過分は雑費へ合算する", () => {
    const stmt = computeAgricultureStatement({
      ...BASE,
      expenseTotals: {
        雑費: 1_000,
        臨時費A: 100,
        臨時費B: 500,
        臨時費C: 300,
        臨時費D: 200,
        臨時費E: 400,
      },
    });
    expect(stmt.blueExtraExpenses.map((r) => r.category)).toEqual([
      "臨時費B",
      "臨時費E",
      "臨時費C",
      "臨時費D",
    ]);
    expect(stmt.blueMiscExpense).toBe(1_000 + 100);
  });

  test("赤字（負の所得）もそのまま計算される", () => {
    const stmt = computeAgricultureStatement({
      ...BASE,
      salesAmount: 100_000,
      householdConsumption: 0,
      miscRevenue: 0,
      produceOpeningInventory: 0,
      produceClosingInventory: 0,
    });
    expect(stmt.balanceAmount).toBeLessThan(0);
    expect(agricultureIncomeBeforeBlueDeduction(stmt, false)).toBe(
      stmt.balanceAmount + 5_000 - 615_000,
    );
  });

  test("肉用牛特例金額は所得計算に影響しない", () => {
    const withExemption = computeAgricultureStatement({
      ...BASE,
      beefCattleExemptionAmount: 500_000,
    });
    const without = computeAgricultureStatement(BASE);
    expect(withExemption.balanceAmount).toBe(without.balanceAmount);
    expect(withExemption.beefCattleExemptionAmount).toBe(500_000);
  });
});

describe("normalizeAgricultureInput / isAgricultureEmpty / wire変換", () => {
  test("欠けた項目は0になり、金額は整数化され、0円科目は捨てられる", () => {
    const n = normalizeAgricultureInput({
      salesAmount: 100.9,
      expenseTotals: { 肥料費: 200.5, 種苗費: 0, " 肥料費 ": 0 },
    });
    expect(n.salesAmount).toBe(100);
    expect(n.expenseTotals).toEqual({ 肥料費: 200 });
    expect(n.farmName).toBe("");
  });

  test("空判定は全項目ゼロのときだけ真", () => {
    expect(isAgricultureEmpty(normalizeAgricultureInput(null))).toBe(true);
    expect(isAgricultureEmpty(BASE)).toBe(false);
    expect(isAgricultureEmpty({ ...BASE, farmName: "名前だけ" })).toBe(false);
  });

  test("ワイヤ変換は往復で一致する", () => {
    const wire = agricultureToWire(BASE);
    expect(wire.farm_name).toBe("テスト農園");
    expect(wire.sales_amount).toBe(3_000_000);
    expect(agricultureFromWire(wire)).toEqual(normalizeAgricultureInput(BASE));
  });
});
