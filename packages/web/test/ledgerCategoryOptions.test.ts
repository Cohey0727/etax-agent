/**
 * ledgerCategoryOptions.test.ts — 帳簿の勘定科目の選択肢の検証。
 *
 * 担保すること:
 * - 科目推定・CSV の明示列などで付いた、選択肢の一覧に無い科目も選択肢に出る
 *   （無いと選択欄が先頭の「未分類」を表示してしまう）
 */
import { describe, expect, test } from "bun:test";
import { CATEGORY_RULES, sampleTransactions } from "@etax/shared";
import {
  CATEGORY_OPTIONS,
  categoryOptionsWith,
} from "../src/components/organisms/ledger/LedgerPanel/ledgerOptions";

describe("categoryOptionsWith", () => {
  test("一覧に無い科目を末尾に足し、重複はさせない", () => {
    expect(categoryOptionsWith(["外注工賃", "通信費", "外注工賃"])).toEqual([
      ...CATEGORY_OPTIONS,
      "外注工賃",
    ]);
  });

  test("科目推定とサンプルの取引が付ける科目はすべて選択肢に出る", () => {
    const used = [
      ...CATEGORY_RULES.map((rule) => rule.category),
      ...sampleTransactions().map((t) => t.category),
    ];
    const options = categoryOptionsWith(used);
    expect(used.filter((category) => !options.includes(category))).toEqual([]);
  });

  test("空文字は選択肢にしない", () => {
    expect(categoryOptionsWith([""])).toEqual([...CATEGORY_OPTIONS]);
  });
});
