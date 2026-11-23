/**
 * createBillingCheckout.ts — 月額プランの Checkout セッションを作る（usecases）。
 * 料金は月額490円（Stripe 側の Price で定義）。契約は月単位で、
 * 解約は Stripe のカスタマーポータル/次回更新時という一般的な形。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { billingEnabled, createCheckoutSession } from "../gateways/stripeGateway";
import { getDb } from "../lib/db";
import { currentUserId } from "../lib/tenantContext";
import { usersTable } from "../repositories/schema";
import { getSubscriptionRow } from "../repositories/subscriptionRepository";
import {
  CreateCheckoutRequestSchema,
  CreateCheckoutResponseSchema,
} from "../schemas/billing";

export const createBillingCheckoutRoute = createRoute({
  method: "post",
  path: "/api/billing/checkout",
  request: {
    body: {
      content: { "application/json": { schema: CreateCheckoutRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CreateCheckoutResponseSchema } },
      description: "Checkout ページの URL",
    },
  },
});

export const createBillingCheckoutHandler: RouteHandler<
  typeof createBillingCheckoutRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  if (!billingEnabled()) {
    throw new HTTPException(503, { message: "課金が設定されていません" });
  }
  const userId = currentUserId();
  if (userId === undefined) {
    throw new HTTPException(401, { message: "ログインが必要です" });
  }
  const body = (await c.req.json().catch(() => null)) as
    | { success_url?: unknown; cancel_url?: unknown }
    | null;
  const successUrl = typeof body?.success_url === "string" ? body.success_url : "";
  const cancelUrl = typeof body?.cancel_url === "string" ? body.cancel_url : "";
  if (!successUrl || !cancelUrl) {
    throw new HTTPException(400, { message: "success_url と cancel_url が必要です" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const existing = await getSubscriptionRow(db, userId);
  const session = await createCheckoutSession({
    userId,
    customerId: existing?.stripeCustomerId || undefined,
    customerEmail: user?.email,
    successUrl,
    cancelUrl,
  });
  return c.json({ url: session.url });
};
