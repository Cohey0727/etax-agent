import { describe, expect, test } from "bun:test";
import {
  balanceSheetToWire,
  buildTrialBalanceSheet,
  carryOverBalanceSheet,
  emptyBalanceSheetInput,
  isBalanceSheetEmpty,
  normalizeBalanceSheetInput,
  type XtxBalanceSheetInput,
} from "../src";

describe("normalizeBalanceSheetInput", () => {
  test("正しい入力はそのまま取り出す", () => {
    const input: XtxBalanceSheetInput = {
      opening: { cash: 500_000, capital: 500_000 },
      closing: { cash: 1_500_000 },
      extraAsset: { name: "保証金", opening: 100_000, closing: 100_000 },
      ownerLoan: 10_000,
      ownerBorrowing: 20_000,
    };
    expect(normalizeBalanceSheetInput(input)).toEqual(input);
  });

  test("オブジェクトでなければ null", () => {
    expect(normalizeBalanceSheetInput(null)).toBeNull();
    expect(normalizeBalanceSheetInput("x")).toBeNull();
    expect(normalizeBalanceSheetInput(undefined)).toBeNull();
  });

  test("未知の勘定キーと不正な金額は捨て、金額は整数化する", () => {
    const result = normalizeBalanceSheetInput({
      opening: { cash: 100.9, unknown_account: 5, checking_deposit: "100" },
      closing: { cash: Number.NaN },
      ownerLoan: Number.POSITIVE_INFINITY,
      ownerBorrowing: 30_000,
    });
    expect(result).toEqual({
      opening: { cash: 100 },
      closing: {},
      extraAsset: undefined,
      extraLiability1: undefined,
      extraLiability2: undefined,
      ownerLoan: 0,
      ownerBorrowing: 30_000,
    });
  });

  test("期末の元入金は保持しない（期首元入金から計算される様式のため）", () => {
    const result = normalizeBalanceSheetInput({
      opening: { capital: 500_000 },
      closing: { capital: 999_999, cash: 100 },
      ownerLoan: 0,
      ownerBorrowing: 0,
    });
    expect(result?.closing).toEqual({ cash: 100 });
    expect(result?.opening.capital).toBe(500_000);
  });
});

describe("isBalanceSheetEmpty", () => {
  test("空の入力は true", () => {
    expect(isBalanceSheetEmpty(emptyBalanceSheetInput())).toBe(true);
    expect(
      isBalanceSheetEmpty({ opening: { cash: 0 }, closing: {}, ownerLoan: 0, ownerBorrowing: 0 }),
    ).toBe(true);
  });

  test("金額が1つでもあれば false", () => {
    expect(
      isBalanceSheetEmpty({ opening: { cash: 1 }, closing: {}, ownerLoan: 0, ownerBorrowing: 0 }),
    ).toBe(false);
    expect(
      isBalanceSheetEmpty({ opening: {}, closing: {}, ownerLoan: 0, ownerBorrowing: 5 }),
    ).toBe(false);
  });

  test("追加行は名称だけでも入力ありとして扱う", () => {
    expect(
      isBalanceSheetEmpty({
        opening: {},
        closing: {},
        extraAsset: { name: "保証金", opening: 0, closing: 0 },
        ownerLoan: 0,
        ownerBorrowing: 0,
      }),
    ).toBe(false);
  });
});

describe("carryOverBalanceSheet", () => {
  const previous: XtxBalanceSheetInput = {
    opening: { cash: 300_000, capital: 800_000 },
    closing: { cash: 900_000, accounts_receivable: 100_000, borrowings: 200_000 },
    extraAsset: { name: "保証金", opening: 50_000, closing: 60_000 },
    extraLiability1: { name: "未払消費税", opening: 10_000, closing: 40_000 },
    ownerLoan: 30_000,
    ownerBorrowing: 40_000,
  };

  test("前年の期末が当期の期首になり、元入金は繰越計算で引き継ぐ", () => {
    const carried = carryOverBalanceSheet(previous);
    expect(carried.opening).toEqual({
      cash: 900_000,
      accounts_receivable: 100_000,
      borrowings: 200_000,
      // 期首元入金 800,000 + 所得 0 + 事業主借 40,000 − 事業主貸 30,000
      capital: 810_000,
    });
    expect(carried.extraAsset).toEqual({ name: "保証金", opening: 60_000, closing: 0 });
    expect(carried.extraLiability1).toEqual({ name: "未払消費税", opening: 40_000, closing: 0 });
    // 期末側と事業主貸借は当期分（未入力なら0）
    expect(carried.closing).toEqual({});
    expect(carried.ownerLoan).toBe(0);
    expect(carried.ownerBorrowing).toBe(0);
  });

  test("当期の期末入力がある場合はそれを保持する", () => {
    const current: XtxBalanceSheetInput = {
      opening: {},
      closing: { cash: 1_200_000 },
      extraAsset: { name: "保証金", opening: 0, closing: 70_000 },
      ownerLoan: 5_000,
      ownerBorrowing: 0,
    };
    const carried = carryOverBalanceSheet(previous, current);
    expect(carried.closing).toEqual({ cash: 1_200_000 });
    expect(carried.extraAsset).toEqual({ name: "保証金", opening: 60_000, closing: 70_000 });
    expect(carried.ownerLoan).toBe(5_000);
  });

  test("繰越後の期首は前年の期末残高で貸借が一致する", () => {
    // 前年：期末資産 900,000+100,000+60,000+事業主貸30,000 = 1,090,000
    // 　　　期末負債・資本 200,000+40,000+事業主借40,000+元入金800,000+所得10,000 = 1,090,000
    const prevSheet = buildTrialBalanceSheet(previous, 10_000);
    expect(prevSheet.closing_balanced).toBe(true);
    // 元入金は 800,000 + 所得10,000 + 事業主借40,000 − 事業主貸30,000 = 820,000
    const carried = carryOverBalanceSheet(previous, null, 10_000);
    expect(carried.opening.capital).toBe(820_000);
    const carriedSheet = buildTrialBalanceSheet(carried, 0);
    expect(carriedSheet.opening_assets).toBe(1_060_000);
    expect(carriedSheet.opening_liabilities_capital).toBe(1_060_000);
    expect(carriedSheet.opening_balanced).toBe(true);
  });
});

describe("balanceSheetToWire", () => {
  test("追加行と事業主貸借のキーが snake_case になる", () => {
    const wire = balanceSheetToWire({
      opening: { cash: 100 },
      closing: { cash: 200 },
      extraAsset: { name: "保証金", opening: 1, closing: 2 },
      extraLiability1: { name: "未払消費税", opening: 3, closing: 4 },
      ownerLoan: 5,
      ownerBorrowing: 6,
    });
    expect(wire).toEqual({
      opening: { cash: 100 },
      closing: { cash: 200 },
      extra_asset: { name: "保証金", opening: 1, closing: 2 },
      extra_liability1: { name: "未払消費税", opening: 3, closing: 4 },
      extra_liability2: undefined,
      owner_loan: 5,
      owner_borrowing: 6,
    });
  });
});
