import { describe, expect, test } from "bun:test";
import { parseAmount } from "../src/utils/format";

describe("parseAmount", () => {
  test("全角の数字・マイナスを半角として読む", () => {
    expect(parseAmount("１２３")).toBe(123);
    expect(parseAmount("－５００")).toBe(-500);
    expect(parseAmount("−1000")).toBe(-1000);
  });

  test("小数点以下は切り捨てる（桁を詰めない）", () => {
    expect(parseAmount("1.5")).toBe(1);
    expect(parseAmount("12.50")).toBe(12);
    expect(parseAmount("-1.9")).toBe(-1);
    expect(parseAmount("１２．５")).toBe(12);
  });

  test("先頭の「-」だけを符号とし、途中・末尾の記号は無視する", () => {
    expect(parseAmount("1,234")).toBe(1234);
    expect(parseAmount("¥5,000-")).toBe(5000);
    expect(parseAmount("5-")).toBe(5);
    expect(parseAmount("12-3")).toBe(123);
    expect(parseAmount(" - 3")).toBe(-3);
  });

  test("数字が無ければ 0", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("-")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
  });
});
