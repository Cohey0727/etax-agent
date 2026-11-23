/**
 * fixedAsset.ts — 固定資産台帳エンドポイントのスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";

export const DepreciationMethodSchema = z.enum([
  "straight_line",
  "declining_balance",
  "lump_sum",
  "small_special",
]);

export const FixedAssetSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    quantity: z.string(),
    income_type: z.string(),
    acquisition_date: z.string(),
    service_start_date: z.string().nullable(),
    cost: z.number(),
    useful_life_years: z.number(),
    method: DepreciationMethodSchema,
    business_ratio_percent: z.number(),
    disposed_date: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("FixedAsset");

export type FixedAssetResponse = z.infer<typeof FixedAssetSchema>;

export const FixedAssetIdParamSchema = z
  .object({ id: z.string() })
  .openapi("FixedAssetIdParam");

export const MessageResponseSchema = z
  .object({ message: z.string() })
  .openapi("MessageResponse");

export const CreateFixedAssetRequestSchema = z
  .object({
    name: z.string().min(1),
    quantity: z.string().optional(),
    income_type: z.enum(["business", "real_estate"]).optional(),
    acquisition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    service_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    cost: z.number().int().positive(),
    useful_life_years: z.number().int().min(1),
    method: DepreciationMethodSchema.optional(),
    business_ratio_percent: z.number().min(0).max(100).optional(),
    disposed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .openapi("CreateFixedAssetRequest");

export type CreateFixedAssetRequest = z.infer<typeof CreateFixedAssetRequestSchema>;

export const UpdateFixedAssetRequestSchema = CreateFixedAssetRequestSchema.partial().openapi(
  "UpdateFixedAssetRequest",
);

export type UpdateFixedAssetRequest = z.infer<typeof UpdateFixedAssetRequestSchema>;

export const FixedAssetListResponseSchema = z
  .object({ assets: z.array(FixedAssetSchema) })
  .openapi("FixedAssetListResponse");

export type FixedAssetListResponse = z.infer<typeof FixedAssetListResponseSchema>;

export const SingleFixedAssetResponseSchema = z
  .object({ asset: FixedAssetSchema.nullable() })
  .openapi("SingleFixedAssetResponse");

export type SingleFixedAssetResponse = z.infer<typeof SingleFixedAssetResponseSchema>;

export const DepreciationRowSchema = z
  .object({
    asset_id: z.number(),
    name: z.string(),
    income_type: z.string(),
    year: z.number(),
    months: z.number(),
    opening_book_value: z.number(),
    basis_amount: z.number(),
    rate: z.number(),
    guarantee_amount: z.number().nullable(),
    ordinary: z.number(),
    deductible: z.number(),
    closing_book_value: z.number(),
  })
  .openapi("DepreciationRow");

export const DepreciationScheduleResponseSchema = z
  .object({
    year: z.number(),
    rows: z.array(DepreciationRowSchema),
    /** 所得区分ごとの必要経費算入額の合計 */
    deductible_totals: z.object({
      business: z.number(),
      real_estate: z.number(),
    }),
    /** 少額特例の年間上限（300万円）の使用状況 */
    small_special: z.object({
      total: z.number(),
      cap: z.number(),
      exceeded: z.boolean(),
    }),
  })
  .openapi("DepreciationScheduleResponse");

export type DepreciationScheduleResponse = z.infer<typeof DepreciationScheduleResponseSchema>;
