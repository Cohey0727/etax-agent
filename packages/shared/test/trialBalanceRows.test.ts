/**
 * trialBalanceRows.test.ts — 残高試算表の損益計算書を当年・前年の比較の行にする検証。
 */
import { describe, expect, test } from "bun:test";
import { importCsvText } from "../src/ledger";
import { buildTrialBalance } from "../src/trialBalance";
import { trialBalancePlRows } from "../src/trialBalanceRows";

const tx = importCsvText(
  [
    "date,description,amount,account,category,income_type",
    "2024-03-01,開発費用,1000000,事業口座,売上高,business",
    "2024-05-01,AWS,-20000,事業口座,通信費,business",
    "2025-03-01,開発費用,1200000,事業口座,売上高,business",
    "2025-04-01,商品,-100000,事業口座,仕入高,business",
    "2025-05-01,AWS,-30000,事業口座,通信費,business",
  ].join("\n"),
);

describe("trialBalancePlRows", () => {
  test("決算書の並びで、当年と前年の金額を並べる", () => {
    const current = buildTrialBalance(tx, 2025).business;
    const previous = buildTrialBalance(tx, 2024).business;
    const rows = trialBalancePlRows(current, previous);
    expect(rows.map((row) => [row.label, row.current, row.previous])).toEqual([
      ["売上（収入）金額", 1_200_000, 1_000_000],
      ["売上高", 1_200_000, 1_000_000],
      ["仕入高", 100_000, 0],
      ["差引金額（売上総利益）", 1_100_000, 1_000_000],
      ["通信費", 30_000, 20_000],
      ["経費計", 30_000, 20_000],
      ["差引金額", 1_070_000, 980_000],
      ["青色申告特別控除", 650_000, 650_000],
      ["所得金額", 420_000, 330_000],
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});
