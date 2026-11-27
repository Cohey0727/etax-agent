/**
 * cashFlow.ts — 資金繰りレポートの API スキーマ（schemas）。
 *
 * 集計そのものは shared の buildCashFlowReport が担い、ここはその結果の
 * API 形式（snake_case）と、表示窓を指定するクエリの形だけを持つ。
 * 数値のクエリは文字列で届くので、受け取り時に数値へ変換して範囲を検証する。
 */
import { z } from "@hono/zod-openapi";

/** 表示月数の上限（2年分まで）。 */
export const CASH_FLOW_MAX_MONTHS = 24;

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const GetCashFlowReportQuerySchema = z
  .object({
    from: z.string().regex(monthPattern).optional(),
    months: z.coerce.number().int().min(1).max(CASH_FLOW_MAX_MONTHS).optional(),
    opening_balance: z.coerce.number().int().optional(),
  })
  .openapi("GetCashFlowReportQuery");

export type GetCashFlowReportQuery = z.infer<typeof GetCashFlowReportQuerySchema>;

export const CashFlowMonthSchema = z
  .object({
    month: z.string(),
    phase: z.enum(["past", "current", "future"]),
    actual_inflow: z.number().int(),
    actual_outflow: z.number().int(),
    scheduled_inflow: z.number().int(),
    net_change: z.number().int(),
    closing_balance: z.number().int(),
  })
  .openapi("CashFlowMonth");

export const CashFlowReceiptSchema = z
  .object({
    document_id: z.number().int(),
    document_number: z.string().nullable(),
    counterparty_name: z.string(),
    issue_date: z.string().regex(datePattern),
    due_date: z.string().regex(datePattern).nullable(),
    total_amount: z.number().int(),
    remaining_amount: z.number().int(),
    status: z.enum(["unpaid", "partial", "paid"]),
  })
  .openapi("CashFlowReceipt");

export const CashFlowScheduledReceiptSchema = CashFlowReceiptSchema.extend({
  scheduled_month: z.string().regex(monthPattern),
  overdue: z.boolean(),
}).openapi("CashFlowScheduledReceipt");

export const CashFlowReportResponseSchema = z
  .object({
    from_month: z.string(),
    to_month: z.string(),
    opening_balance: z.number().int(),
    months: z.array(CashFlowMonthSchema),
    upcoming_receipts: z.array(CashFlowScheduledReceiptSchema),
    undated_receipts: z.array(CashFlowReceiptSchema),
    total_actual_inflow: z.number().int(),
    total_actual_outflow: z.number().int(),
    total_scheduled_inflow: z.number().int(),
    overdue_amount: z.number().int(),
    projected_closing_balance: z.number().int(),
  })
  .openapi("CashFlowReportResponse");

export type CashFlowReportResponse = z.infer<typeof CashFlowReportResponseSchema>;
export type CashFlowMonthResponse = z.infer<typeof CashFlowMonthSchema>;
export type CashFlowReceiptResponse = z.infer<typeof CashFlowReceiptSchema>;
export type CashFlowScheduledReceiptResponse = z.infer<typeof CashFlowScheduledReceiptSchema>;
