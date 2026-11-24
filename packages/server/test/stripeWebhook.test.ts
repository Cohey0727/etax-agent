/**
 * stripeWebhook.test.ts — Stripe Webhook まわりの検証（Issue #8）。
 * イベント冪等性、currentPeriodEnd の保持、署名タイムスタンプ検証。
 */
import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { verifyWebhookSignature } from "../src/gateways/stripeGateway";
import {
  getSubscriptionRow,
  isStripeEventRecorded,
  recordStripeEventIfNew,
  upsertSubscriptionRow,
} from "../src/repositories/subscriptionRepository";
import { createUser } from "../src/repositories/userRepository";

describe("Webhook イベントの冪等性記録", () => {
  test("同じイベントIDは2回記録できない", async () => {
    const db = await createTestDb();
    expect(await isStripeEventRecorded(db, "evt_1")).toBe(false);
    expect(await recordStripeEventIfNew(db, "evt_1", "checkout.session.completed")).toBe(true);
    expect(await isStripeEventRecorded(db, "evt_1")).toBe(true);
    expect(await recordStripeEventIfNew(db, "evt_1", "checkout.session.completed")).toBe(false);
  });
});

describe("upsertSubscriptionRow の currentPeriodEnd", () => {
  test("未指定（undefined）では既知の期間終了を消さない", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "period@example.com", "password-123");
    const periodEnd = new Date("2027-01-31T00:00:00Z");
    await upsertSubscriptionRow(db, user.id, {
      status: "active",
      currentPeriodEnd: periodEnd,
      stripeCustomerId: "cus_1",
    });
    // checkout.session.completed 相当（currentPeriodEnd を渡さない更新）
    await upsertSubscriptionRow(db, user.id, { status: "active" });
    const row = await getSubscriptionRow(db, user.id);
    expect(row?.currentPeriodEnd?.getTime()).toBe(periodEnd.getTime());
    // 明示的に渡せば更新される
    const next = new Date("2027-02-28T00:00:00Z");
    await upsertSubscriptionRow(db, user.id, { status: "active", currentPeriodEnd: next });
    const updated = await getSubscriptionRow(db, user.id);
    expect(updated?.currentPeriodEnd?.getTime()).toBe(next.getTime());
  });
});

describe("verifyWebhookSignature のタイムスタンプ検証", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_x", type: "ping" });

  function headerFor(timestamp: string): string {
    const sig = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    return `t=${timestamp},v1=${sig}`;
  }

  test("正しい署名は通る", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyWebhookSignature(payload, headerFor(String(now)), secret, now)).toBe(true);
  });

  test("数値でないタイムスタンプは弾く（NaN すり抜け防止）", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyWebhookSignature(payload, headerFor("not-a-number"), secret, now)).toBe(false);
  });

  test("古すぎるタイムスタンプは弾く", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(verifyWebhookSignature(payload, headerFor(String(now - 3600)), secret, now)).toBe(false);
  });
});
