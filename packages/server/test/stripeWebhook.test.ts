/**
 * stripeWebhook.test.ts — Stripe Webhook まわりの検証。
 * イベント冪等性、currentPeriodEnd の保持、署名タイムスタンプ検証、
 * サブスクリプションイベントの適用条件（HTTP）。
 */
import { createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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

describe("サブスクリプションイベントの適用（HTTP）", () => {
  const webhookSecret = "whsec_http_test";
  const saved = {
    DATABASE_URL: process.env.DATABASE_URL,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    ETAX_DATA_DIR: process.env.ETAX_DATA_DIR,
  };
  let appFetch: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
    process.env.ETAX_DATA_DIR ??= await mkdtemp(join(tmpdir(), "etax-webhook-data-"));
    const mod = await import("../src/index");
    appFetch = mod.default.fetch as (req: Request) => Promise<Response>;
  });

  afterAll(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  async function deliver(event: Record<string, unknown>): Promise<number> {
    const payload = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    const res = await appFetch(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` },
        body: payload,
      }),
    );
    return res.status;
  }

  test("期間終了はサブスクリプション項目（items.data）から読む", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "items-period@example.com", "password-123");
    await upsertSubscriptionRow(db, user.id, {
      status: "active",
      stripeCustomerId: "cus_items",
      stripeSubscriptionId: "sub_items",
    });
    const status = await deliver({
      id: "evt_items_1",
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "sub_items",
          customer: "cus_items",
          status: "active",
          items: {
            data: [
              { current_period_end: 1_800_000_000 },
              { current_period_end: 1_790_000_000 },
            ],
          },
        },
      },
    });
    expect(status).toBe(200);
    const row = await getSubscriptionRow(db, user.id);
    expect(row?.currentPeriodEnd?.getTime()).toBe(1_790_000_000 * 1000);
  });

  test("保存済みと別のサブスクリプションの削除イベントでは、契約中の状態を上書きしない", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "two-subs@example.com", "password-123");
    await upsertSubscriptionRow(db, user.id, {
      status: "active",
      stripeCustomerId: "cus_two",
      stripeSubscriptionId: "sub_new",
    });
    const status = await deliver({
      id: "evt_old_deleted",
      type: "customer.subscription.deleted",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "sub_old", customer: "cus_two", status: "canceled" } },
    });
    expect(status).toBe(200);
    const row = await getSubscriptionRow(db, user.id);
    expect(row?.status).toBe("active");
    expect(row?.stripeSubscriptionId).toBe("sub_new");
  });

  test("サブスクリプション ID が未記録なら、そのイベントを適用する", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "no-sub-id@example.com", "password-123");
    await upsertSubscriptionRow(db, user.id, { status: "active", stripeCustomerId: "cus_blank" });
    const status = await deliver({
      id: "evt_blank_updated",
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: "sub_first", customer: "cus_blank", status: "past_due" } },
    });
    expect(status).toBe(200);
    const row = await getSubscriptionRow(db, user.id);
    expect(row?.status).toBe("past_due");
    expect(row?.stripeSubscriptionId).toBe("sub_first");
  });
});
