import { describe, expect, test } from "bun:test";
import { yearMonthLabel } from "../src/yearMonthLabel";

describe("yearMonthLabel", () => {
  test("月の先頭のゼロを落とす", () => {
    expect(yearMonthLabel("2026-03")).toBe("2026年3月");
    expect(yearMonthLabel("2026-12")).toBe("2026年12月");
  });
});
