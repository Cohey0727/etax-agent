/**
 * depreciationScheduleService.test.ts — 減価償却スケジュールと申告ステータスの保存の
 * 共通の本体（REST・MCP・エージェント）の検証。
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { Db } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenantContext";
import { insertFixedAssetRow, listFixedAssetRows } from "../src/repositories/fixedAssetRepository";
import { createUser } from "../src/repositories/userRepository";
import { setFilingStatusForAgent } from "../src/services/agent/agentSettingsTools";
import { buildDepreciationSchedule } from "../src/services/fixedAssets/buildDepreciationSchedule";
import { dispatchMcpTool } from "../src/services/mcp/mcpTools";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;

let db: Db;
let userId: number;
const asUser = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant(userId, fn);

beforeEach(async () => {
  db = await createTestDb();
  userId = (await createUser(db, "depreciation-service@example.com", "password-123")).id;
});

describe("減価償却スケジュール", () => {
  test("MCP の get_depreciation は画面（REST）と同じ内容を返す", async () => {
    await asUser(() =>
      insertFixedAssetRow(db, {
        name: "PC",
        quantity: "",
        incomeType: "business",
        acquisitionDate: "2024-01-10",
        serviceStartDate: null,
        cost: 300_000,
        usefulLifeYears: 4,
        method: "straight_line",
        businessRatioPercent: 60,
        disposedDate: null,
      }),
    );
    const expected = buildDepreciationSchedule(await asUser(() => listFixedAssetRows(db)), 2025);
    expect(expected.rows).toHaveLength(1);
    const result = await asUser(() => dispatchMcpTool("get_depreciation", { year: 2025 }));
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(expected);
  });
});

describe("申告ステータスの保存", () => {
  test("エージェント経由でも範囲外の年は保存しない", async () => {
    await expect(asUser(() => setFilingStatusForAgent(99999, { confirmed: true }))).rejects.toThrow(
      "year が不正です",
    );
    const saved = await asUser(() => setFilingStatusForAgent(2025, { confirmed: true }));
    expect(saved.year).toBe(2025);
    expect(saved.confirmed_at).not.toBeNull();
  });
});
