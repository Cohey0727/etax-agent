/**
 * receipt.ts — 領収書画像の解析APIのスキーマ（schemas）。
 *
 * 解析依頼は2経路ある:
 *   1. fileId: 署名付きURLでストレージへ直アップロード済みのファイルを指定する。
 *   2. imageBase64 + mimeType: 画像を直接渡す（従来経路・フォールバック用）。
 * どちらか一方を指定する（ハンドラ側で検証する）。
 */
import { z } from "@hono/zod-openapi";
import { AccountClassificationSchema } from "./classify";
import { UploadableImageMimeTypeSchema } from "./file";

export const AnalyzeReceiptRequestSchema = z
  .object({
    /** 署名付きURLでアップロード済みのファイルID。 */
    fileId: z
      .string()
      .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
      .optional(),
    /** 画像の Base64（data: プレフィックスなし）。fileId と排他。 */
    imageBase64: z.string().min(1).optional(),
    mimeType: UploadableImageMimeTypeSchema.optional(),
  })
  .openapi("AnalyzeReceiptRequest");

export const AnalyzeReceiptResponseSchema = z
  .object({
    date: z.string().nullable(),
    amount: z.number().nullable(),
    payee: z.string(),
    description: z.string(),
    classification: AccountClassificationSchema,
  })
  .openapi("AnalyzeReceiptResponse");

export type AnalyzeReceiptResponse = z.infer<typeof AnalyzeReceiptResponseSchema>;

/** 証憑レコード（解析結果と紐付け先の取引）。 */
export const ReceiptSchema = z
  .object({
    id: z.number(),
    file_id: z.string(),
    mime_type: z.string(),
    extracted: AnalyzeReceiptResponseSchema.nullable(),
    transaction_id: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("Receipt");

export type ReceiptResponse = z.infer<typeof ReceiptSchema>;

export const ReceiptListResponseSchema = z
  .object({ receipts: z.array(ReceiptSchema) })
  .openapi("ReceiptListResponse");

export type ReceiptListResponse = z.infer<typeof ReceiptListResponseSchema>;

export const SingleReceiptResponseSchema = z
  .object({ receipt: ReceiptSchema.nullable() })
  .openapi("SingleReceiptResponse");

export type SingleReceiptResponse = z.infer<typeof SingleReceiptResponseSchema>;

export const ReceiptFileIdParamSchema = z
  .object({ fileId: z.string() })
  .openapi("ReceiptFileIdParam");

export const LinkReceiptRequestSchema = z
  .object({ transaction_id: z.number().int().positive() })
  .openapi("LinkReceiptRequest");

export type LinkReceiptRequest = z.infer<typeof LinkReceiptRequestSchema>;
