/**
 * yearSelectOptions.test.ts — サイドバーの年度セレクタの選択肢の検証。
 *
 * 担保すること:
 * - 表示中の年度は、取引が1件も無くても選択肢に入る（一致する選択肢が無いと
 *   select は先頭の「年度を追加」を選んだ表示になり、それを選び直せない）
 * - 追加の選択肢は、並んだ年度の最大＋1と最小−1
 */
import { describe, expect, test } from "bun:test";
import { yearSelectOptions } from "../src/components/templates/AppTemplate/appTemplateUtils";

describe("yearSelectOptions", () => {
  test("取引が無いときは表示中の年度と、その前後の追加を出す", () => {
    expect(yearSelectOptions([], 2026)).toEqual({ years: [2026], nextYear: 2027, prevYear: 2025 });
  });

  test("取引のある年度を新しい順に並べ、前後に追加を出す", () => {
    expect(yearSelectOptions([2025, 2024], 2025)).toEqual({
      years: [2025, 2024],
      nextYear: 2026,
      prevYear: 2023,
    });
  });

  test("並びに無い表示中の年度も選択肢に入れる", () => {
    expect(yearSelectOptions([2024], 2026)).toEqual({
      years: [2026, 2024],
      nextYear: 2027,
      prevYear: 2023,
    });
  });
});
