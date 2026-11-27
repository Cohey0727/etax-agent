/**
 * fixedAssets.test.ts — 固定資産台帳リポジトリと減価償却明細行の検証。
 * テスト用 PostgreSQL で検証する。
 */
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import {
  depreciationDetailRowsForYear,
  fixedAssetToApi,
  insertFixedAssetRow,
  listFixedAssetRows,
  updateFixedAssetRow,
} from "../src/repositories/fixedAssetRepository";

describe("固定資産台帳リポジトリ", () => {
  test("登録・一覧・更新（除却）ができる", async () => {
    const db = await createTestDb();
    const row = await insertFixedAssetRow(db, {
      name: "パソコン",
      quantity: "1台",
      incomeType: "business",
      acquisitionDate: "2025-04-01",
      serviceStartDate: null,
      cost: 600_000,
      usefulLifeYears: 4,
      method: "straight_line",
      businessRatioPercent: 100,
      disposedDate: null,
    });
    expect(row?.name).toBe("パソコン");
    const api = fixedAssetToApi(row!);
    expect(api.acquisition_date).toBe("2025-04-01");
    expect(api.method).toBe("straight_line");

    const updated = await updateFixedAssetRow(db, row!.id, { disposedDate: "2027-03-31" });
    expect(updated?.disposedDate).toBe("2027-03-31");
    expect((await listFixedAssetRows(db)).length).toBe(1);
  });

  test("決算書明細行は所得区分別に分かれ、除却の翌年は出ない", async () => {
    const db = await createTestDb();
    await insertFixedAssetRow(db, {
      name: "パソコン",
      quantity: "",
      incomeType: "business",
      acquisitionDate: "2025-04-01",
      serviceStartDate: null,
      cost: 600_000,
      usefulLifeYears: 4,
      method: "straight_line",
      businessRatioPercent: 100,
      disposedDate: null,
    });
    await insertFixedAssetRow(db, {
      name: "賃貸物件のエアコン",
      quantity: "",
      incomeType: "real_estate",
      acquisitionDate: "2025-01-05",
      serviceStartDate: null,
      cost: 300_000,
      usefulLifeYears: 6,
      method: "declining_balance",
      businessRatioPercent: 100,
      disposedDate: "2026-06-30",
    });
    const rows2025 = depreciationDetailRowsForYear(await listFixedAssetRows(db), 2025);
    expect(rows2025.business.length).toBe(1);
    // 定額法4年・4月供用（9か月）: 600,000 × 0.250 × 9/12 = 112,500
    expect(rows2025.business[0].ordinary).toBe(112_500);
    expect(rows2025.business[0].methodLabel).toBe("定額法");
    expect(rows2025.realEstate.length).toBe(1);
    // 除却した2026年は除却月（6月）までの6か月分
    const rows2026 = depreciationDetailRowsForYear(await listFixedAssetRows(db), 2026);
    expect(rows2026.realEstate[0].months).toBe(6);
    // 除却は2026年なので2027年の明細には出ない
    const rows2027 = depreciationDetailRowsForYear(await listFixedAssetRows(db), 2027);
    expect(rows2027.realEstate.length).toBe(0);
    expect(rows2027.business.length).toBe(1);
  });

  test("一括償却資産は除却した翌年以後も3年均等の明細を出す（所得税法施行令139条）", async () => {
    const db = await createTestDb();
    await insertFixedAssetRow(db, {
      name: "タブレット",
      quantity: "",
      incomeType: "business",
      acquisitionDate: "2025-05-01",
      serviceStartDate: null,
      cost: 150_000,
      usefulLifeYears: 3,
      method: "lump_sum",
      businessRatioPercent: 100,
      disposedDate: "2025-11-30",
    });
    for (const year of [2025, 2026, 2027]) {
      const rows = depreciationDetailRowsForYear(await listFixedAssetRows(db), year);
      expect(rows.business.map((row) => row.ordinary)).toEqual([50_000]);
    }
    expect(depreciationDetailRowsForYear(await listFixedAssetRows(db), 2028).business).toEqual([]);
  });
});
