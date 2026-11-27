/**
 * common.ts — 共通スキーマ（schemas）。
 *
 * ErrorSchema: エラーレスポンスは `{ error }` 形式（web / native / 外部利用者が
 * error を文言として読む）。
 */
import { TAX_PARAMETERS } from "@etax/shared";
import { z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

export type ErrorResponse = z.infer<typeof ErrorSchema>;

/** 税務パラメータを定義している年分。所得税額の計算と申告データの出力はこの年分だけを受ける。 */
export const TaxYearSchema = z
  .number()
  .int()
  .refine((year) => Object.hasOwn(TAX_PARAMETERS, year));
