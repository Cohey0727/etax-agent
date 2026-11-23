/**
 * stripeWebhook.ts — Stripe Webhook を受けて課金状態を同期する（usecases）。
 * 認証は署名検証（STRIPE_WEBHOOK_SECRET）が担うため、セッション認証の
 * 対象外パスとして登録する。
 */
import { createRoute, RouteHandler, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { verifyWebhookSignature } from "../gateways/stripeGateway";
import { getDb } from "../lib/db";
import {
  getSubscriptionByCustomerId,
  upsertSubscriptionRow,
} from "../repositories/subscriptionRepository";

export const stripeWebhookRoute = createRoute({
  method: "post",
  path: "/api/billing/webhook",
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ received: z.boolean() }) } },
      description: "受信した",
    },
  },
});

interface StripeObject {
  id?: string;
  customer?: string;
  subscription?: string;
  status?: string;
  current_period_end?: number;
  client_reference_id?: string;
  metadata?: Record<string, string>;
}

function periodEnd(sec: number | undefined): Date | null {
  return typeof sec === "number" ? new Date(sec * 1000) : null;
}

export const stripeWebhookHandler: RouteHandler<typeof stripeWebhookRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HTTPException(503, { message: "Webhook が設定されていません" });
  const payload = await c.req.text();
  if (!verifyWebhookSignature(payload, c.req.header("stripe-signature"), secret)) {
    throw new HTTPException(400, { message: "署名が不正です" });
  }
  const event = JSON.parse(payload) as { type?: string; data?: { object?: StripeObject } };
  const obj = event.data?.object ?? {};
  const customerId = typeof obj.customer === "string" ? obj.customer : "";

  if (event.type === "checkout.session.completed") {
    const userId = Number(obj.client_reference_id ?? obj.metadata?.user_id);
    if (Number.isInteger(userId) && userId > 0) {
      await upsertSubscriptionRow(db, userId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: typeof obj.subscription === "string" ? obj.subscription : "",
        status: "active",
      });
    }
  } else if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const existing = customerId ? await getSubscriptionByCustomerId(db, customerId) : undefined;
    const userId = existing?.ownerUserId ?? Number(obj.metadata?.user_id);
    if (Number.isInteger(userId) && userId > 0) {
      await upsertSubscriptionRow(db, userId, {
        stripeCustomerId: customerId || undefined,
        stripeSubscriptionId: typeof obj.id === "string" ? obj.id : undefined,
        status:
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : (obj.status ?? "active"),
        currentPeriodEnd: periodEnd(obj.current_period_end),
      });
    }
  }
  return c.json({ received: true });
};
