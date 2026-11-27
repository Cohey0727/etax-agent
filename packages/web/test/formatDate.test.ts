import { describe, expect, test } from "bun:test";
import { formatDate } from "../src/utils/format";

process.env.TZ = "Asia/Tokyo";

describe("formatDate", () => {
  test("UTC の日時を現地（日本時間）の日付にする", () => {
    expect(formatDate("2026-03-14T22:30:00.000Z")).toBe("2026/03/15");
  });

  test("日付だけの文字列はその日付のまま", () => {
    expect(formatDate("2026-03-15")).toBe("2026/03/15");
  });

  test("空・解釈できない値", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("不明な日付")).toBe("不明な日付");
  });
});
