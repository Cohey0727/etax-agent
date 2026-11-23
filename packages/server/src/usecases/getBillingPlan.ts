/**
 * getBillingPlan.ts — 現在の所有者のプラン状態を返す（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { billingEnabled } from "../gateways/stripeGateway";
import { getDb } from "../lib/db";
import { getSubscriptionRow } from "../repositories/subscriptionRepository";
import { BillingPlanResponseSchema } from "../schemas/billing";

export const getBillingPlanRoute = createRoute({
  method: "get",
  path: "/api/billing/plan",
  responses: {
    200: {
      content: { "application/json": { schema: BillingPlanResponseSchema } },
      description: "プラン状態",
    },
  },
});

export const getBillingPlanHandler: RouteHandler<typeof getBillingPlanRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const row = await getSubscriptionRow(db);
  return c.json({
    billing_enabled: billingEnabled(),
    status: row?.status ?? "none",
    current_period_end: row?.currentPeriodEnd?.toISOString() ?? null,
  });
};
