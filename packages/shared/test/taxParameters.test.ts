/**
 * taxParameters.test.ts — 年度ごとの税務パラメータ（定数テーブル＋提供層）の検証。
 * 設計ルール: 年度 if 分岐は禁止し、未定義の年分は例外にする。
 */
import { describe, expect, test } from "bun:test";
import { TAX_PARAMETERS, lookupTier, taxParametersFor } from "../src/taxParameters";
import { basicDeduction } from "../src/deductions";

describe("taxParametersFor", () => {
  test("定義済みの年分はパラメータを返す", () => {
    for (const year of [2023, 2024, 2025, 2026, 2027]) {
      expect(TAX_PARAMETERS[year]).toBeDefined();
      expect(taxParametersFor(year).basicDeductionTiers.length).toBeGreaterThan(0);
    }
  });

  test("未定義の年分は推測で補わず例外にする", () => {
    expect(() => taxParametersFor(2022)).toThrow(/未定義/);
    expect(() => taxParametersFor(2028)).toThrow(/未定義/);
    expect(() => basicDeduction(2028, 1_000_000)).toThrow(/未定義/);
  });

  test("lookupTier は上限以下で最初の段階を返す", () => {
    const tiers = [
      { upTo: 100, amount: 10 },
      { upTo: 200, amount: 20 },
    ];
    expect(lookupTier(tiers, 100)).toBe(10);
    expect(lookupTier(tiers, 101)).toBe(20);
    expect(lookupTier(tiers, 999)).toBe(0);
  });
});
