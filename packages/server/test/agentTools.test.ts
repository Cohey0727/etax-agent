/**
 * agentTools.test.ts — 対話エージェントの計算ツール（dispatchTool）の検証。
 *
 * 集計の青色申告特別控除が、申告の種類（引数、無ければ画面の申告入力）に
 * 従うことを担保する（国税庁タックスアンサー No.2072）。
 */
import { describe, expect, test } from "bun:test";
import { Transaction } from "@etax/shared";
import { AgentContext, dispatchTool } from "../src/services/agent/agentTools";

const transactions: Transaction[] = [
  {
    date: "2025-03-01",
    year: 2025,
    description: "売上",
    amount: 3_000_000,
    account: "",
    category: "売上高",
    income_type: "business",
  },
  {
    date: "2025-03-02",
    year: 2025,
    description: "経費",
    amount: -500_000,
    account: "",
    category: "雑費",
    income_type: "business",
  },
];

function blueTotal(args: Record<string, unknown>, ctx: AgentContext): unknown {
  const result = dispatchTool("aggregate_year", { year: 2025, ...args }, ctx) as Record<
    string,
    unknown
  >;
  return result["blue_deduction_total"];
}

describe("aggregate_year の青色申告特別控除", () => {
  test("申告入力が無ければ青色65万円で計算する", () => {
    expect(blueTotal({}, { transactions })).toBe(650_000);
  });

  test("画面の申告入力が白色なら控除しない", () => {
    const ctx = { transactions, deductions: { year: 2025, state: { filingType: "white" } } };
    expect(blueTotal({}, ctx)).toBe(0);
  });

  test("引数の申告の種類が画面の申告入力より優先される", () => {
    const ctx = { transactions, deductions: { year: 2025, state: { filingType: "white" } } };
    expect(blueTotal({ filing_type: "blue10" }, ctx)).toBe(100_000);
  });

  test("別の年の申告入力は使わない", () => {
    const ctx = { transactions, deductions: { year: 2024, state: { filingType: "white" } } };
    expect(blueTotal({}, ctx)).toBe(650_000);
  });
});
