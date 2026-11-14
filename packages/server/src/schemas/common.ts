/**
 * common.ts — 共通スキーマ（schemas）。
 *
 * ErrorSchema: 本プロジェクトのエラーレスポンスは従来どおり `{ error }` 形式。
 * CODING_CONVENTIONS_BACKEND の例は `message` フィールドだが、既存クライアント
 * （web / 外部利用者）との互換を優先し `error` を正とする。
 */
import { z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

export type ErrorResponse = z.infer<typeof ErrorSchema>;
