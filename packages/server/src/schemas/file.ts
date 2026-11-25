/**
 * file.ts — ファイルアップロード（署名付きURL発行）のスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";

/** アップロードを受け付ける画像形式（領収書の想定）。 */
export const UploadableImageMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const PresignUploadFileRequestSchema = z
  .object({
    /**
     * アップロードするファイルの Content-Type。署名に含まれるため、
     * 実際の送信と一致させる。画像は領収書・固定資産用、
     * application/pdf は受信通知（purpose=filing_receipt）専用で、
     * 組み合わせの検証はハンドラ側で行う。
     */
    contentType: z.enum([...UploadableImageMimeTypeSchema.options, "application/pdf"]),
    /** 用途。オブジェクトキーの接頭辞が変わる（未指定は領収書）。 */
    purpose: z.enum(["receipt", "fixed_asset", "filing_receipt"]).optional(),
  })
  .openapi("PresignUploadFileRequest");

export const PresignUploadFileResponseSchema = z
  .object({
    /** ファイルID。このIDでアップロード先が決まり、解析依頼でも使う。 */
    fileId: z.string(),
    /** 署名付きアップロードURL（PUT）。有効期限つき。 */
    uploadUrl: z.string(),
    /** URLの有効期限（秒）。 */
    expiresInSeconds: z.number(),
  })
  .openapi("PresignUploadFileResponse");

export type PresignUploadFileResponse = z.infer<typeof PresignUploadFileResponseSchema>;
