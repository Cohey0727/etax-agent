/**
 * invoice.ts — 請求書（帳票）エンドポイントのスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";
import { IdSchema } from "./common";

export const InvoiceTaxRoundingSchema = z.enum(["floor", "round", "ceil"]);

export const InvoiceLineSchema = z
  .object({
    id: z.number(),
    item_name: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unit_price: z.number(),
    tax_rate_percent: z.number(),
    is_reduced_rate: z.boolean(),
    amount: z.number(),
  })
  .openapi("InvoiceLine");

export type InvoiceLineResponse = z.infer<typeof InvoiceLineSchema>;

/** 発行者情報（発行時点のスナップショット）。 */
export const InvoiceIssuerSchema = z
  .object({
    name: z.string(),
    zip_code: z.string(),
    address: z.string(),
    /** 適格請求書発行事業者の登録番号。適格請求書でない場合は空文字 */
    invoice_number: z.string(),
  })
  .openapi("InvoiceIssuer");

export type InvoiceIssuer = z.infer<typeof InvoiceIssuerSchema>;

export const InvoiceRateGroupSchema = z
  .object({
    tax_rate_percent: z.number(),
    subtotal: z.number(),
    tax: z.number(),
  })
  .openapi("InvoiceRateGroup");

export const InvoiceTotalsSchema = z
  .object({
    groups: z.array(InvoiceRateGroupSchema),
    subtotal: z.number(),
    tax_total: z.number(),
    total: z.number(),
  })
  .openapi("InvoiceTotals");

export type InvoiceTotalsResponse = z.infer<typeof InvoiceTotalsSchema>;

export const InvoiceSchema = z
  .object({
    id: z.number(),
    kind: z.string(),
    status: z.enum(["draft", "issued"]),
    document_number: z.string().nullable(),
    issue_date: z.string(),
    due_date: z.string().nullable(),
    counterparty_name: z.string(),
    counterparty_address: z.string(),
    is_qualified: z.boolean(),
    tax_rounding: InvoiceTaxRoundingSchema,
    memo: z.string(),
    corrects_document_id: z.number().nullable(),
    /** 修正元の帳票番号（表示用）。修正でない場合は null */
    corrects_document_number: z.string().nullable(),
    /** 発行時点の発行者スナップショット。下書きでは null */
    issuer: InvoiceIssuerSchema.nullable(),
    lines: z.array(InvoiceLineSchema),
    totals: InvoiceTotalsSchema,
    /** 入金消込の状態。下書きは null */
    payment_status: z.enum(["unpaid", "partial", "paid"]).nullable(),
    /** 消込済み額（差額調整を含む）。 */
    settled_amount: z.number(),
    /** 未消込の残額。 */
    remaining_amount: z.number(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Invoice");

export type InvoiceResponse = z.infer<typeof InvoiceSchema>;

export const InvoiceIdParamSchema = z.object({ id: IdSchema }).openapi("InvoiceIdParam");

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const InvoiceLineInputSchema = z.object({
  item_name: z.string(),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  unit_price: z.number().int().min(0),
  tax_rate_percent: z.number().int().min(0).max(100),
  is_reduced_rate: z.boolean().optional(),
});

export const CreateInvoiceRequestSchema = z
  .object({
    issue_date: z.string().regex(datePattern),
    due_date: z.string().regex(datePattern).nullable().optional(),
    counterparty_name: z.string(),
    counterparty_address: z.string().optional(),
    is_qualified: z.boolean().optional(),
    tax_rounding: InvoiceTaxRoundingSchema.optional(),
    memo: z.string().optional(),
    lines: z.array(InvoiceLineInputSchema),
  })
  .openapi("CreateInvoiceRequest");

export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequestSchema>;

export const UpdateInvoiceRequestSchema = CreateInvoiceRequestSchema.openapi(
  "UpdateInvoiceRequest",
);

export type UpdateInvoiceRequest = z.infer<typeof UpdateInvoiceRequestSchema>;

export const InvoiceListResponseSchema = z
  .object({ invoices: z.array(InvoiceSchema) })
  .openapi("InvoiceListResponse");

export type InvoiceListResponse = z.infer<typeof InvoiceListResponseSchema>;

export const SingleInvoiceResponseSchema = z
  .object({ invoice: InvoiceSchema.nullable() })
  .openapi("SingleInvoiceResponse");

export type SingleInvoiceResponse = z.infer<typeof SingleInvoiceResponseSchema>;

/**
 * 発行控えの検索条件（電子帳簿保存法の検索要件: 取引年月日・金額・取引先）。
 * q は交付先名称と帳票番号の部分一致。
 */
export const ListInvoicesQuerySchema = z
  .object({
    q: z.string().optional(),
    from: z.string().regex(datePattern).optional(),
    to: z.string().regex(datePattern).optional(),
    /** 整数でない値は条件なしとして扱う。 */
    min_total: z.coerce.number().int().optional().catch(undefined).openapi({ type: "integer" }),
    max_total: z.coerce.number().int().optional().catch(undefined).openapi({ type: "integer" }),
    status: z.enum(["draft", "issued"]).optional(),
  })
  .openapi("ListInvoicesQuery");

export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;
