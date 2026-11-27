import { describe, expect, test } from "bun:test";
import { selectableYears } from "../src/components/DateField/calendar";

describe("selectableYears", () => {
  test("生年月日や古い資産の取得日の年も選べる", () => {
    const years = selectableYears(2026, null);
    expect(years).toContain(1950);
    expect(years).toContain(1995);
    expect(years[years.length - 1]).toBe(2041);
  });

  test("範囲外の値でも、その年を選択肢に含める", () => {
    expect(selectableYears(2026, 1890)[0]).toBe(1890);
    expect(selectableYears(2026, 2060)).toContain(2060);
  });

  test("年は昇順で重複しない", () => {
    const years = selectableYears(2026, 2026);
    expect(years).toEqual([...new Set(years)].sort((a, b) => a - b));
  });
});
