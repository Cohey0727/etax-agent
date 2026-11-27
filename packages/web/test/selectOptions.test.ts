/**
 * selectOptions.test.ts — 科目の選択肢の検証。
 *
 * 担保すること:
 * - 選択肢に無い値（学習履歴から生成されたルールの独自の科目など）も選択肢に入れる。
 *   一致する option が無い select は先頭の科目を選んだ表示になり、保存される値と食い違う
 * - 選択肢にある値なら並びを変えない
 */
import { describe, expect, test } from "bun:test";
import { withCurrentOption } from "../src/utils/selectOptions";

describe("withCurrentOption", () => {
  test("選択肢に無い値を末尾に足す", () => {
    expect(withCurrentOption(["売上高", "通信費"], "研究開発費")).toEqual([
      "売上高",
      "通信費",
      "研究開発費",
    ]);
  });

  test("選択肢にある値なら並びはそのまま", () => {
    expect(withCurrentOption(["売上高", "通信費"], "通信費")).toEqual(["売上高", "通信費"]);
  });
});
