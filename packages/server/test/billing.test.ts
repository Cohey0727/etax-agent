/**
 * billing.test.ts — 課金基盤の検証: Webhook 署名検証と課金状態リポジトリ。
 */
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { verifyWebhookSignature } from "../src/gateways/stripeGateway";
import { Db } from "../src/lib/db";
import * as schema from "../src/repositories/schema";
import {
  getSubscriptionRow,
  hasActivePlan,
  upsertSubscriptionRow,
} from "../src/repositories/subscriptionRepository";
import { runWithTenant } from "../src/lib/tenantContext";

const SECRET = "whsec_test_secret";

function sign(payload: string, timestamp: number): string {
  const v1 = createHmac("sha256", SECRET).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

describe("verifyWebhookSignature", () => {
  test("正しい署名は通り、改ざん・期限切れは弾く", () => {
    const payload = JSON.stringify({ type: "checkout.session.completed" });
    const now = 1_700_000_000;
    expect(verifyWebhookSignature(payload, sign(payload, now), SECRET, now)).toBe(true);
    expect(verifyWebhookSignature(payload + "x", sign(payload, now), SECRET, now)).toBe(false);
    expect(verifyWebhookSignature(payload, sign(payload, now - 3600), SECRET, now)).toBe(false);
    expect(verifyWebhookSignature(payload, undefined, SECRET, now)).toBe(false);
    expect(verifyWebhookSignature(payload, sign(payload, now), "whsec_other", now)).toBe(false);
  });
});

function createTestDb(): Db {
  const client = new Database(":memory:");
  client.exec(`
    CREATE TABLE subscriptions (
      id integer PRIMARY KEY AUTOINCREMENT,
      owner_user_id integer NOT NULL UNIQUE,
      stripe_customer_id text NOT NULL DEFAULT '',
      stripe_subscription_id text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'none',
      current_period_end integer,
      updated_at integer NOT NULL
    );
  `);
  return drizzle(client, { schema }) as Db;
}

describe("課金状態リポジトリ", () => {
  test("契約→有効判定→解約の流れ", async () => {
    const db = createTestDb();
    await runWithTenant(3, async () => {
      expect(await hasActivePlan(db)).toBe(false);
      await upsertSubscriptionRow(db, 3, {
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        status: "active",
        currentPeriodEnd: new Date("2027-01-31T00:00:00Z"),
      });
      expect(await hasActivePlan(db)).toBe(true);
      const row = await getSubscriptionRow(db);
      expect(row?.stripeCustomerId).toBe("cus_123");
      expect(row?.currentPeriodEnd?.toISOString()).toBe("2027-01-31T00:00:00.000Z");
      await upsertSubscriptionRow(db, 3, { status: "canceled" });
      expect(await hasActivePlan(db)).toBe(false);
      // 解約しても顧客IDは保持される（再契約時の再利用）
      expect((await getSubscriptionRow(db))?.stripeCustomerId).toBe("cus_123");
    });
  });
});
