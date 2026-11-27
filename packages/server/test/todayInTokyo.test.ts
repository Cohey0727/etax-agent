/**
 * todayInTokyo.test.ts — 日本時間の今日の日付の検証。
 * サーバーのタイムゾーンに依らず、日本時間で日付が変わることを担保する。
 */
import { describe, expect, test } from "bun:test";
import { todayInTokyo } from "../src/lib/todayInTokyo";

describe("todayInTokyo", () => {
  test("UTC の前日 15時以降は、日本時間では翌日になる", () => {
    expect(todayInTokyo(new Date("2025-12-31T15:00:00Z"))).toBe("2026-01-01");
    expect(todayInTokyo(new Date("2025-12-31T14:59:59Z"))).toBe("2025-12-31");
  });

  test("月・日は2桁で返す", () => {
    expect(todayInTokyo(new Date("2026-03-04T00:00:00Z"))).toBe("2026-03-04");
  });
});
