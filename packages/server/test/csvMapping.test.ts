/**
 * csvMapping.test.ts — キーワード・ヒューリスティクスによる列マッピングと、
 * そのマッピングで取り込んだ金額の符号の検証。
 * 銀行・カード明細の見出しの表記ゆれで、入金と出金が入れ替わったり、
 * 入金行が無言で落ちたりしないことを担保する。
 */
import { describe, expect, test } from "bun:test";
import { parseCsv } from "@etax/shared";
import { heuristicMapping } from "../src/services/csvImport/csvMapping";
import { parseWithMapping } from "../src/services/csvImport/csvParsing";

function importAmounts(csv: string): { amounts: number[]; skipped: number } {
  const rows = parseCsv(csv);
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const mapping = heuristicMapping(headers, rows.slice(1));
  const parsed = parseWithMapping(rows, mapping, "テスト銀行");
  return { amounts: parsed.transactions.map((t) => t.amount), skipped: parsed.skippedRows };
}

describe("heuristicMapping", () => {
  test("入出金を符号付きの1列で持つ形式は、金額列としてそのまま使う", () => {
    const csv =
      "取引日,入出金(円),取引後残高(円),入出金内容\n" +
      "20250105,300000,1300000,振込 カ）テストショウジ\n" +
      "20250110,-5000,1295000,デビット AWS\n";
    const rows = parseCsv(csv);
    const mapping = heuristicMapping(rows[0] ?? [], rows.slice(1));
    expect(mapping).toMatchObject({
      amountColumn: "入出金(円)",
      debitColumn: null,
      creditColumn: null,
      descriptionColumn: "入出金内容",
      amountSign: "as-is",
    });
    expect(importAmounts(csv).amounts).toEqual([300000, -5000]);
  });

  test("「預かり金額」（お なし）を入金列として読む", () => {
    const csv =
      "日付,摘要,摘要内容,支払い金額,預かり金額,差引残高\n" +
      "2025/1/5,振込,カ）テスト,,300000,1300000\n" +
      "2025/1/10,カード,AWS,5000,,1295000\n";
    expect(importAmounts(csv)).toEqual({ amounts: [300000, -5000], skipped: 0 });
  });

  test("出金列と入金列がある形式で、出金列に負数で入っていても出金として扱う", () => {
    const csv = "日付,摘要,出金,入金\n2025/1/10,AWS,-5000,\n2025/1/11,売上,,300000\n";
    expect(importAmounts(csv).amounts).toEqual([-5000, 300000]);
  });

  test("利用金額だけのカード明細では、負数（返品・返金）を収入として扱う", () => {
    const csv = "利用日,利用店名,利用金額\n2025/1/10,書店,1500\n2025/1/12,書店（返品）,-1500\n";
    expect(importAmounts(csv).amounts).toEqual([-1500, 1500]);
  });
});
