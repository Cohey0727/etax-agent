/**
 * fixedAssets.test.ts — 固定資産台帳リポジトリと減価償却明細行の検証。
 * インメモリ SQLite で検証する。
 */
import { describe, expect, test } from "bun:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Db } from "../src/lib/db";
import * as schema from "../src/repositories/schema";
import {
  depreciationDetailRowsForYear,
  fixedAssetToApi,
  insertFixedAssetRow,
  listFixedAssetRows,
  updateFixedAssetRow,
} from "../src/repositories/fixedAssetRepository";

function createTestDb(): Db {
  const client = new Database(":memory:");
  client.exec(`
    CREATE TABLE fixed_assets (
      id integer PRIMARY KEY AUTOINCREMENT,
      name text NOT NULL,
      quantity text NOT NULL DEFAULT '',
      income_type text NOT NULL DEFAULT 'business',
      acquisition_date text NOT NULL,
      service_start_date text,
      cost integer NOT NULL,
      useful_life_years integer NOT NULL,
      method text NOT NULL DEFAULT 'straight_line',
      business_ratio_percent integer NOT NULL DEFAULT 100,
      disposed_date text,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      owner_user_id integer NOT NULL DEFAULT 1);
  `);
  return drizzle(client, { schema }) as Db;
}

describe("固定資産台帳リポジトリ", () => {
  test("登録・一覧・更新（除却）ができる", async () => {
    const db = createTestDb();
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
    const db = createTestDb();
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
    // 除却は2026年なので2027年の明細には出ない
    const rows2027 = depreciationDetailRowsForYear(await listFixedAssetRows(db), 2027);
    expect(rows2027.realEstate.length).toBe(0);
    expect(rows2027.business.length).toBe(1);
  });
});
