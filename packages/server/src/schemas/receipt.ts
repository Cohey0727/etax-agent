/**
 * receipt.ts — 領収書画像の解析APIのスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";
import { AccountClassificationSchema } from "./classify";

export const AnalyzeReceiptRequestSchema = z
  .object({
    /** 画像の Base64（data: プレフィックスなし）。 */
    imageBase64: z.string().min(1),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
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
