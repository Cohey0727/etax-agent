/**
 * agricultureExpenses.test.ts — 農業所得の経費（科目別合計）の編集の検証。
 *
 * 担保すること:
 * - 追加科目は金額を 0（入力途中の空欄）にしても消えない。消すのは削除だけ
 * - 様式の固定科目は 0 なら持たない（一覧は常に出るので消えて見えない）
 */
import { describe, expect, test } from "bun:test";
import {
  removeAgricultureExpense,
  setAgricultureExpense,
} from "../src/components/organisms/filing/AgriculturePanel/AgriculturePanel.utils";

describe("setAgricultureExpense / removeAgricultureExpense", () => {
  test("追加科目は金額を 0 にしても残る", () => {
    const totals = setAgricultureExpense({ 出荷手数料: 50_000 }, "出荷手数料", 0);
    expect(totals).toEqual({ 出荷手数料: 0 });
  });

  test("金額 0 のまま追加した科目も残る", () => {
    expect(setAgricultureExpense({}, "出荷手数料", 0)).toEqual({ 出荷手数料: 0 });
  });

  test("固定科目は 0 なら持たない", () => {
    expect(setAgricultureExpense({ 肥料費: 10_000 }, "肥料費", 0)).toEqual({});
    expect(setAgricultureExpense({}, "肥料費", 20_000)).toEqual({ 肥料費: 20_000 });
  });

  test("削除で科目ごと消える", () => {
    expect(removeAgricultureExpense({ 出荷手数料: 50_000, 肥料費: 1 }, "出荷手数料")).toEqual({
      肥料費: 1,
    });
  });
});
