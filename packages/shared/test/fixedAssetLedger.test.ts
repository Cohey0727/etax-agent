/**
 * fixedAssetLedger.test.ts — 固定資産台帳の画面の数値（年ごとの残高・償却費・
 * 対象年の判定・サマリ）と入力検証の検証。
 */
import { describe, expect, test } from "bun:test";
import {
  FixedAssetLedgerEntry,
  fixedAssetIncomeTypeLabel,
  fixedAssetSchedule,
  fixedAssetYearFigures,
  isFixedAssetInYear,
  summarizeFixedAssets,
  validateFixedAssetInput,
} from "../src/fixedAssetLedger";

const asset = (partial: Partial<FixedAssetLedgerEntry>): FixedAssetLedgerEntry => ({
  acquisition_date: "2023-01-10",
  service_start_date: null,
  cost: 400_000,
  useful_life_years: 4,
  method: "straight_line",
  business_ratio_percent: 100,
  disposed_date: null,
  ...partial,
});

describe("fixedAssetYearFigures", () => {
  test("定額法4年: 年ごとの償却費と年末残高、進み具合", () => {
    const pc = asset({});
    expect(fixedAssetYearFigures(pc, 2023)).toMatchObject({
      deductible: 100_000,
      bookValue: 300_000,
      progress: 0.25,
    });
    expect(fixedAssetYearFigures(pc, 2026)).toMatchObject({ deductible: 99_999, bookValue: 1 });
  });

  test("償却開始前の年は取得価額のまま、償却費 0", () => {
    expect(fixedAssetYearFigures(asset({}), 2022)).toMatchObject({
      deductible: 0,
      bookValue: 400_000,
      progress: 0,
    });
  });

  test("除却の翌年以降は償却費 0、残高は除却年の残高で止まる", () => {
    const disposed = asset({ disposed_date: "2024-06-30" });
    expect(fixedAssetYearFigures(disposed, 2024)).toMatchObject({
      deductible: 100_000,
      bookValue: 200_000,
    });
    expect(fixedAssetYearFigures(disposed, 2025)).toMatchObject({
      deductible: 0,
      bookValue: 200_000,
    });
  });
});

describe("fixedAssetSchedule", () => {
  test("除却した資産は除却した年までのスケジュールにする", () => {
    const schedule = fixedAssetSchedule(asset({ disposed_date: "2024-06-30" }));
    expect(schedule.map((row) => row.year)).toEqual([2023, 2024]);
    expect(schedule.reduce((sum, row) => sum + row.deductible, 0)).toBe(200_000);
  });
});

describe("isFixedAssetInYear", () => {
  test("償却スケジュールに現れる年だけ対象。除却した年までは対象", () => {
    const disposed = asset({ disposed_date: "2024-06-30" });
    expect(isFixedAssetInYear(disposed, 2022)).toBe(false);
    expect(isFixedAssetInYear(disposed, 2024)).toBe(true);
    expect(isFixedAssetInYear(disposed, 2025)).toBe(false);
  });
});

describe("summarizeFixedAssets", () => {
  test("対象年より前に除却した資産は件数・合計から外し、除却済みとして数える", () => {
    const summary = summarizeFixedAssets(
      [asset({}), asset({ cost: 200_000, disposed_date: "2023-12-31" })],
      2024,
    );
    expect(summary).toEqual({
      count: 1,
      disposedCount: 1,
      totalCost: 400_000,
      totalBookValue: 200_000,
    });
  });
});

describe("validateFixedAssetInput", () => {
  const input = { ...asset({}), name: "PC" };
  test("正しい入力は null", () => {
    expect(validateFixedAssetInput(input)).toBeNull();
  });
  test("名称・取得価額・事業専用割合の誤りを返す", () => {
    expect(validateFixedAssetInput({ ...input, name: " " })).toBe("資産の名称を入力してください");
    expect(validateFixedAssetInput({ ...input, cost: 0 })).toBe(
      "取得価額は正の整数で入力してください",
    );
    expect(validateFixedAssetInput({ ...input, business_ratio_percent: 101 })).toBe(
      "事業専用割合は0〜100の整数で入力してください",
    );
  });
});

describe("fixedAssetIncomeTypeLabel", () => {
  test("既知の区分は表示名、未知の値はそのまま", () => {
    expect(fixedAssetIncomeTypeLabel("agriculture")).toBe("農業");
    expect(fixedAssetIncomeTypeLabel("toString")).toBe("toString");
  });
});
