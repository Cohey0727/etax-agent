import { describe, expect, test } from "bun:test";
import { parseSignedAmount } from "../src/features/filing/fields/signedAmount";

describe("符号つきの金額入力", () => {
  test("マイナスと桁区切りを受け付ける", () => {
    expect(parseSignedAmount("-300,000")).toBe(-300_000);
    expect(parseSignedAmount("1,234")).toBe(1234);
  });

  test("入力途中の「-」や空欄は 0（下書きは画面側で残す）", () => {
    expect(parseSignedAmount("-")).toBe(0);
    expect(parseSignedAmount("")).toBe(0);
  });

  test("全角の数字・マイナスを半角として読む", () => {
    expect(parseSignedAmount("－１２，３４５")).toBe(-12_345);
    expect(parseSignedAmount("−500")).toBe(-500);
  });

  test("小数点以下は切り捨て、途中の「-」は無視する", () => {
    expect(parseSignedAmount("1.5")).toBe(1);
    expect(parseSignedAmount("-12.9")).toBe(-12);
    expect(parseSignedAmount("5-")).toBe(5);
  });
});
