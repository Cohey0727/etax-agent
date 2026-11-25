/**
 * reconciliation.ts — 入金消込エンドポイントのスキーマ（schemas）。
 *
 * 消込は発行済み請求書に対する入金取引の紐付け。状態（未消込／一部消込／
 * 消込済み）と残額はサーバーが消込レコードから都度計算して返す。
 * 自動推測は候補の提示までで、確定は作成エンドポイントへの明示的な
 * 承認操作でのみ行う。
 */
import { z } from "@hono/zod-openapi";
import { TransactionSchema } from "./transaction";

export const InvoicePaymentKindSchema = z.enum(["payment", "fee", "discount", "overpayment"]);

export const InvoicePaymentStatusSchema = z.enum(["unpaid", "partial", "paid"]);

export const InvoicePaymentSchema = z
  .object({
    id: z.number(),
    document_id: z.number(),
    transaction_id: z.number(),
    /** 過入金の預り金処理で自動生成した取引のID。それ以外は null */
    adjustment_transaction_id: z.number().nullable(),
    kind: InvoicePaymentKindSchema,
    amount: z.number(),
    /** 紐付く取引（入金取引または差額調整の自動生成取引）。 */
    transaction: TransactionSchema.nullable(),
    created_at: z.string(),
  })
  .openapi("InvoicePayment");

export type InvoicePaymentResponse = z.infer<typeof InvoicePaymentSchema>;

export const InvoiceSettlementSchema = z
  .object({
    total_amount: z.number(),
    settled_amount: z.number(),
    remaining_amount: z.number(),
    /** 過入金として預り金処理した額（消込済み額には含めない）。 */
    overpaid_amount: z.number(),
    status: InvoicePaymentStatusSchema,
  })
  .openapi("InvoiceSettlement");

export type InvoiceSettlementResponse = z.infer<typeof InvoiceSettlementSchema>;

export const InvoicePaymentsResponseSchema = z
  .object({
    payments: z.array(InvoicePaymentSchema),
    settlement: InvoiceSettlementSchema,
  })
  .openapi("InvoicePaymentsResponse");

export type InvoicePaymentsResponse = z.infer<typeof InvoicePaymentsResponseSchema>;

/**
 * 消込の作成リクエスト。
 * amount は入金取引から充当する額（省略時は未消込額と請求残額の小さい方）。
 * fee_amount / discount_amount は差額調整として同時に計上する額で、
 * それぞれ支払手数料／売上値引の取引を自動生成して消込に数える。
 * treat_excess_as_deposit が true のとき、充当しきれない入金の残りを
 * 過入金として預り金の取引を自動生成し、その入金取引を使い切る。
 */
export const CreateInvoicePaymentRequestSchema = z
  .object({
    transaction_id: z.number().int().positive(),
    amount: z.number().int().positive().optional(),
    fee_amount: z.number().int().min(0).optional(),
    discount_amount: z.number().int().min(0).optional(),
    treat_excess_as_deposit: z.boolean().optional(),
  })
  .openapi("CreateInvoicePaymentRequest");

export type CreateInvoicePaymentRequest = z.infer<typeof CreateInvoicePaymentRequestSchema>;

export const InvoicePaymentIdParamSchema = z
  .object({ id: z.string(), paymentId: z.string() })
  .openapi("InvoicePaymentIdParam");

export const ReconciliationCandidateSchema = z
  .object({
    transaction: TransactionSchema,
    /** この取引の未消込額。 */
    unapplied_amount: z.number(),
    /** 承認した場合に充当される額。 */
    suggested_amount: z.number(),
    score: z.number(),
    reasons: z.array(z.enum(["amount_exact", "amount_partial", "name_match", "date_close"])),
  })
  .openapi("ReconciliationCandidate");

export type ReconciliationCandidateResponse = z.infer<typeof ReconciliationCandidateSchema>;

export const ReconciliationSuggestionsResponseSchema = z
  .object({ candidates: z.array(ReconciliationCandidateSchema) })
  .openapi("ReconciliationSuggestionsResponse");

export type ReconciliationSuggestionsResponse = z.infer<
  typeof ReconciliationSuggestionsResponseSchema
>;
