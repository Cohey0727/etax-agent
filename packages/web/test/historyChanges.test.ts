/**
 * historyChanges.test.ts — 変更履歴ビューアの差分生成（取得した履歴
 * スナップショット → 表示データへの変換）の検証。
 *
 * 担保すること:
 * - 登録（before なし）は全項目が「― → 値」になる
 * - 削除（after なし）は全項目が「値 → ―」になる
 * - 訂正は値が変わった項目だけが差分になり、順序は変更後の並びに従う
 * - 両方なしは空になる
 */
import { describe, expect, test } from "bun:test";
import {
  buildHistoryChanges,
  HistoryFieldValue,
} from "../src/components/molecules/HistoryTimeline/historyChanges";

const before: HistoryFieldValue[] = [
  { label: "日付", value: "2026-02-01" },
  { label: "摘要", value: "AWS 利用料" },
  { label: "金額", value: "-5,500円" },
];

const after: HistoryFieldValue[] = [
  { label: "日付", value: "2026-02-01" },
  { label: "摘要", value: "AWS 利用料" },
  { label: "金額", value: "-6,600円" },
];

describe("buildHistoryChanges（履歴の差分生成）", () => {
  test("登録は全項目が ― → 値 になる", () => {
    expect(buildHistoryChanges(null, after)).toEqual([
      { label: "日付", before: "―", after: "2026-02-01" },
      { label: "摘要", before: "―", after: "AWS 利用料" },
      { label: "金額", before: "―", after: "-6,600円" },
    ]);
  });

  test("削除は全項目が 値 → ― になる", () => {
    expect(buildHistoryChanges(before, null)).toEqual([
      { label: "日付", before: "2026-02-01", after: "―" },
      { label: "摘要", before: "AWS 利用料", after: "―" },
      { label: "金額", before: "-5,500円", after: "―" },
    ]);
  });

  test("訂正は変わった項目だけが差分になる", () => {
    expect(buildHistoryChanges(before, after)).toEqual([
      { label: "金額", before: "-5,500円", after: "-6,600円" },
    ]);
  });

  test("変更が無ければ空になる", () => {
    expect(buildHistoryChanges(before, before)).toEqual([]);
  });

  test("両方なければ空になる", () => {
    expect(buildHistoryChanges(null, null)).toEqual([]);
  });
});
