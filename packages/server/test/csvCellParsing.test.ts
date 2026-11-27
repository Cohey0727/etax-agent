/**
 * csvCellParsing.test.ts — CSVセルの日付・金額パースの回帰テスト（Issue #11）。
 * 全角表記・和暦の元年など、銀行・カード明細で実際に現れる表記が
 * 読めずに行ごと無言で落ちないことを担保する。
 */
import { describe, expect, test } from "bun:test";
import {
  parseAmountCell,
  parseDateCell,
} from "../src/services/csvImport/csvCellParsing";
import { parseWithMapping } from "../src/services/csvImport/csvParsing";
import { CsvMapping } from "../src/schemas/importCsv";

describe("parseDateCell", () => {
  test("令和元年を読める", () => {
    expect(parseDateCell("令和元年5月1日")).toBe("2019-05-01");
  });

  test("平成元年を読める", () => {
    expect(parseDateCell("平成元年1月8日")).toBe("1989-01-08");
  });

  test("全角数字の日付を読める", () => {
    expect(parseDateCell("２０２４年１月５日")).toBe("2024-01-05");
    expect(parseDateCell("２０２４/０２/２９")).toBe("2024-02-29");
  });

  test("実在しない日付は null", () => {
    expect(parseDateCell("2024-02-30")).toBeNull();
  });

  test("和暦の略記（R・H と区切り記号）を西暦に直す", () => {
    expect(parseDateCell("R06.01.05")).toBe("2024-01-05");
    expect(parseDateCell("R6.1.5")).toBe("2024-01-05");
    expect(parseDateCell("r6/1/5")).toBe("2024-01-05");
    expect(parseDateCell("H31.4.30")).toBe("2019-04-30");
    expect(parseDateCell("R元.5.1")).toBe("2019-05-01");
    expect(parseDateCell("令和6/1/5")).toBe("2024-01-05");
  });

  test("2桁年の表記は先頭から読み、文字の後ろの数字を年とみなさない", () => {
    expect(parseDateCell("24/1/5")).toBe("2024-01-05");
    expect(parseDateCell("X31.4.30")).toBeNull();
  });
});

describe("parseAmountCell", () => {
  test("全角括弧のマイナス表記を読める", () => {
    expect(parseAmountCell("（1,000）")).toBe(-1000);
  });

  test("全角マイナスを読める", () => {
    expect(parseAmountCell("－1,000")).toBe(-1000);
    expect(parseAmountCell("−500")).toBe(-500);
  });

  test("従来表記も読める", () => {
    expect(parseAmountCell("(2,500)")).toBe(-2500);
    expect(parseAmountCell("￥12,000円")).toBe(12000);
    expect(parseAmountCell("")).toBeNull();
  });
});

describe("parseWithMapping", () => {
  const mapping: CsvMapping = {
    dateColumn: "日付",
    descriptionColumn: "摘要",
    amountColumn: "金額",
    debitColumn: null,
    creditColumn: null,
    balanceColumn: null,
    accountColumn: null,
    categoryColumn: null,
    incomeTypeColumn: null,
    taxCategoryColumn: null,
    dateFormat: "YYYY/MM/DD",
    amountSign: "as-is",
  };

  test("ファイル内の完全同一行も落とさない（同日同額の別取引）", () => {
    const rows = [
      ["日付", "摘要", "金額"],
      ["2025/01/10", "ギフトカードチャージ", "-1000"],
      ["2025/01/10", "ギフトカードチャージ", "-1000"],
    ];
    const result = parseWithMapping(rows, mapping, "テスト銀行");
    expect(result.transactions).toHaveLength(2);
  });
});
