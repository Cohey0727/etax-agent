/**
 * filingInputs.test.ts — 申告入力（filing_inputs）のリポジトリ検証。
 * 年度別・所有者別に分離され、JSON のまま往復すること。
 */
import { describe, expect, test } from "bun:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Db } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenantContext";
import * as schema from "../src/repositories/schema";
import {
  getFilingInputRow,
  upsertFilingInputRow,
} from "../src/repositories/filingInputRepository";

function createTestDb(): Db {
  const client = new Database(":memory:");
  client.exec(`
    CREATE TABLE filing_inputs (
      owner_user_id integer NOT NULL DEFAULT 1,
      year integer NOT NULL,
      state text NOT NULL,
      updated_at integer NOT NULL,
      PRIMARY KEY (owner_user_id, year)
    );
  `);
  return drizzle(client, { schema }) as Db;
}

describe("申告入力リポジトリ", () => {
  test("保存→取得で JSON が往復し、上書きできる", async () => {
    const db = createTestDb();
    expect(await getFilingInputRow(db, 2026)).toBeUndefined();
    const state = { filingType: "white", deductions: { socialInsurancePaid: 120000 } };
    await upsertFilingInputRow(db, 2026, state);
    const row = await getFilingInputRow(db, 2026);
    expect(JSON.parse(row!.state)).toEqual(state);
    await upsertFilingInputRow(db, 2026, { filingType: "blue65" });
    const updated = await getFilingInputRow(db, 2026);
    expect(JSON.parse(updated!.state)).toEqual({ filingType: "blue65" });
    // 年度が違えば別物
    expect(await getFilingInputRow(db, 2025)).toBeUndefined();
  });

  test("所有者が違えば分離される", async () => {
    const db = createTestDb();
    await runWithTenant(7, async () => {
      await upsertFilingInputRow(db, 2026, { filingType: "white" });
    });
    expect(await getFilingInputRow(db, 2026)).toBeUndefined();
    const row = await runWithTenant(7, () => getFilingInputRow(db, 2026));
    expect(JSON.parse(row!.state)).toEqual({ filingType: "white" });
  });
});
