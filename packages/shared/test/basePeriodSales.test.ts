import { describe, expect, test } from "bun:test";
import { Transaction, deriveBasePeriodSalesThousands } from "../src";

function sale(amount: number, tax_category: string, year: number): Transaction {
  return {
    date: `${year}-05-01`,
    description: "売上",
    amount,
    account: "",
    category: "売上高",
    income_type: "business",
    tax_category,
    year,
  } as Transaction;
}

describe("基準期間の課税売上高（帳簿から）", () => {
  test("輸出などの免税売上も課税売上高に含める（税抜きはしない）", () => {
    // 課税売上 11,000,000（税抜 10,000,000）＋ 免税売上 3,000,000 = 13,000 千円
    const transactions = [sale(11_000_000, "課税売上10%", 2023), sale(3_000_000, "免税売上", 2023)];
    expect(deriveBasePeriodSalesThousands(transactions, 2025)).toBe(13_000);
  });
});
