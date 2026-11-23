/**
 * billing.ts — 課金（プラン状態・Checkout）のスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";

export const BillingPlanResponseSchema = z
  .object({
    /** 課金基盤が有効か（Stripe 未設定なら false で、制限もかからない） */
    billing_enabled: z.boolean(),
    /** プランの状態。未契約は "none" */
    status: z.string(),
    current_period_end: z.string().nullable(),
  })
  .openapi("BillingPlanResponse");

export const CreateCheckoutRequestSchema = z
  .object({
    success_url: z.string().url(),
    cancel_url: z.string().url(),
  })
  .openapi("CreateCheckoutRequest");

export const CreateCheckoutResponseSchema = z
  .object({
    url: z.string(),
  })
  .openapi("CreateCheckoutResponse");
