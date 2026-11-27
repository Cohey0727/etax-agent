import { sampleTransactions } from "@etax/shared";
import { describe, expect, test } from "bun:test";
import { planSampleRegistration } from "../src/features/import/ImportScreen/ImportScreen.utils";

describe("planSampleRegistration", () => {
  const sample = sampleTransactions();

  test("帳簿に取引がある年のサンプルは追加しない", () => {
    const plan = planSampleRegistration(sample, new Set([2025]));
    expect(plan.skippedYears).toEqual([2025]);
    expect(plan.register.length).toBeGreaterThan(0);
    expect(plan.register.every((tx) => tx.year === 2024)).toBe(true);
  });

  test("どの年にも取引が無ければサンプル全件を追加する", () => {
    const plan = planSampleRegistration(sample, new Set());
    expect(plan.register).toHaveLength(sample.length);
    expect(plan.skippedYears).toEqual([]);
  });

  test("サンプルの全年に取引があれば何も追加しない", () => {
    const years = new Set(sample.map((tx) => tx.year));
    const plan = planSampleRegistration(sample, years);
    expect(plan.register).toEqual([]);
    expect(plan.skippedYears).toEqual([...years].sort((a, b) => a - b));
  });
});
