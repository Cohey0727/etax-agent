/**
 * billing.test.ts — 課金基盤の検証: Webhook 署名検証、Checkout の応答検証、
 * 課金状態リポジトリ。
 */
import { describe, expect, spyOn, test } from "bun:test";
import { createTestDb } from "./testDb";
import { createHmac } from "node:crypto";
import { createCheckoutSession, verifyWebhookSignature } from "../src/gateways/stripeGateway";
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

describe("課金状態リポジトリ", () => {
  test("契約→有効判定→解約の流れ", async () => {
    const db = await createTestDb();
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

describe("createCheckoutSession の応答検証", () => {
  async function withStripeResponse<T>(body: unknown, run: () => Promise<T>): Promise<T> {
    const saved = {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
    };
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_PRICE_ID = "price_dummy";
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body));
    try {
      return await run();
    } finally {
      fetchSpy.mockRestore();
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }

  const input = {
    userId: 1,
    successUrl: "https://app.example/ok",
    cancelUrl: "https://app.example/cancel",
  };

  test("決済ページの URL が返れば、その id と url を返す", async () => {
    const session = await withStripeResponse(
      { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", object: "checkout.session" },
      () => createCheckoutSession(input),
    );
    expect(session).toEqual({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
  });

  test("url の無い応答は失敗にする（\"undefined\" を決済ページとして返さない）", async () => {
    await expect(
      withStripeResponse({ id: "cs_test_2" }, () => createCheckoutSession(input)),
    ).rejects.toThrow();
  });
});
