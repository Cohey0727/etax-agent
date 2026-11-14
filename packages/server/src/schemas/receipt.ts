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
