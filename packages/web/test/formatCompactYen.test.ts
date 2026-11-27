import { describe, expect, test } from "bun:test";
import { formatCompactYen } from "../src/utils/format";

describe("formatCompactYen", () => {
  test("1万円未満は円で、それ以上は万円単位に丸める", () => {
    expect(formatCompactYen(9_999)).toBe("9,999円");
    expect(formatCompactYen(1_234_567)).toBe("¥123万");
    expect(formatCompactYen(-34_000)).toBe("¥-3万");
  });
});
