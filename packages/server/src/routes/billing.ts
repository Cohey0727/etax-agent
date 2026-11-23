/**
 * billing.ts — 課金まわりのルート登録（routes）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createBillingCheckoutHandler,
  createBillingCheckoutRoute,
} from "../usecases/createBillingCheckout";
import { getBillingPlanHandler, getBillingPlanRoute } from "../usecases/getBillingPlan";
import { stripeWebhookHandler, stripeWebhookRoute } from "../usecases/stripeWebhook";

const app = new OpenAPIHono();
app.openapi(getBillingPlanRoute, getBillingPlanHandler);
app.openapi(createBillingCheckoutRoute, createBillingCheckoutHandler);
app.openapi(stripeWebhookRoute, stripeWebhookHandler);

export default app;
