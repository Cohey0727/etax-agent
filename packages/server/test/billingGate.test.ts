/**
 * billingGate.test.ts — 課金まわりの検証（Issue #8）。
 * hasActivePlan の期限チェックと、MCP の XTX 出力ツールのプランゲート
 * （REST の planGate と同じ条件）を確認する。
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import { createUser } from "../src/repositories/userRepository";
import {
  hasActivePlan,
  upsertSubscriptionRow,
} from "../src/repositories/subscriptionRepository";
import { dispatchMcpTool } from "../src/services/mcp/mcpTools";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";

const savedEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  ETAX_AUTH_MODE: process.env.ETAX_AUTH_MODE,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
};

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("hasActivePlan の期限チェック", () => {
  test("status が active でも期間終了を過ぎていれば無効", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "billing@example.com", "password-123");
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await upsertSubscriptionRow(db, user.id, { status: "active", currentPeriodEnd: future });
    expect(await runWithTenant(user.id, () => hasActivePlan(db))).toBe(true);

    await upsertSubscriptionRow(db, user.id, { status: "active", currentPeriodEnd: past });
    expect(await runWithTenant(user.id, () => hasActivePlan(db))).toBe(false);

    await upsertSubscriptionRow(db, user.id, { status: "canceled", currentPeriodEnd: future });
    expect(await runWithTenant(user.id, () => hasActivePlan(db))).toBe(false);
  });
});

describe("MCP のプランゲート", () => {
  test("SaaS＋課金有効でプランが無ければ XTX 出力はエラー、集計は通る", async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    process.env.ETAX_AUTH_MODE = "required";
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_PRICE_ID = "price_dummy";
    const db = await createTestDb();
    const user = await createUser(db, "mcp-gate@example.com", "password-123");

    const blocked = await runWithTenant(user.id, () =>
      dispatchMcpTool("export_xtx", { year: 2026 }),
    );
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0]?.text).toContain("有料プラン");

    const aggregate = await runWithTenant(user.id, () =>
      dispatchMcpTool("aggregate_year", { year: 2026 }),
    );
    expect(aggregate.content[0]?.text).not.toContain("有料プラン");

    // プランに入ればゲートを通る（この先の成否はゲートと無関係）
    await upsertSubscriptionRow(db, user.id, {
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    const allowed = await runWithTenant(user.id, () =>
      dispatchMcpTool("export_xtx", { year: 2026 }),
    );
    expect(allowed.content[0]?.text).not.toContain("有料プラン");
  });
});
