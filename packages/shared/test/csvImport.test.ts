/**
 * csvImport.test.ts — 内部形式CSV取込（importCsvText / parseCsv /
 * suggestCategory）の回帰テスト。
 * 列の有無の区別、空金額、実在しない日付、セル途中のクォート、
 * 表記ゆれへの科目推定を担保する。
 */
import { describe, expect, test } from "bun:test";
import { importCsvText, parseCsv, suggestCategory } from "../src/index";

describe("importCsvText", () => {
  test("income_type 列が無い最小CSVでは区分を推定する（全行 other にならない）", () => {
    const txs = importCsvText(
      ["date,description,amount", "2025-01-10,AWS利用料,-5000", "2025-01-11,家賃収入,100000"].join("\n"),
    );
    expect(txs).toHaveLength(2);
    expect(txs[0]?.category).toBe("通信費");
    expect(txs[0]?.income_type).toBe("business");
    expect(txs[1]?.income_type).toBe("real_estate");
  });

  test("空の amount は 0円取込にせずエラーにする", () => {
    expect(() =>
      importCsvText(["date,description,amount", "2025-01-10,テスト,"].join("\n")),
    ).toThrow(/amount が数値ではありません/);
  });

  test("全角￥と全角数字の amount を読める", () => {
    const txs = importCsvText(
      ["date,description,amount", '2025-01-10,テスト,"￥１２,０００"'].join("\n"),
    );
    expect(txs[0]?.amount).toBe(12000);
  });

  test("実在しない日付（2024-02-30）はエラーにする", () => {
    expect(() =>
      importCsvText(["date,description,amount", "2024-02-30,テスト,100"].join("\n")),
    ).toThrow(/実在しない日付/);
  });

  test("year 列があれば割り当て年度として使う", () => {
    const txs = importCsvText(
      ["date,description,amount,year", "2024-12-31,カード利用,-1000,2025"].join("\n"),
    );
    expect(txs[0]?.year).toBe(2025);
  });
});

describe("parseCsv", () => {
  test("セル途中のクォートで以降の行を飲み込まない", () => {
    const rows = parseCsv('date,description,amount\n2025-01-10,14" MacBook,-1000\n2025-01-11,次の行,200');
    expect(rows).toHaveLength(3);
    expect(rows[1]?.[1]).toBe('14" MacBook');
    expect(rows[2]?.[1]).toBe("次の行");
  });

  test("引用符セルの中のカンマとエスケープを扱える", () => {
    const rows = parseCsv('a,b\n"x,y","z""w"');
    expect(rows[1]).toEqual(["x,y", 'z"w']);
  });
});

describe("suggestCategory", () => {
  test("小文字 aws でも通信費に当たる（正規化して照合）", () => {
    expect(suggestCategory("aws 請求")).toBe("通信費");
  });

  test("全角英数でも当たる", () => {
    expect(suggestCategory("ＡＷＳ 請求")).toBe("通信費");
  });
});
