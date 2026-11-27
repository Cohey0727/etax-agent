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

/** 削除・取り外しなど、結果を文言だけで返す操作の応答。 */
export const MessageResponseSchema = z
  .object({ message: z.string() })
  .openapi("MessageResponse");

/** 税務パラメータを定義している年分。所得税額の計算と申告データの出力はこの年分だけを受ける。 */
export const TaxYearSchema = z
  .number()
  .int()
  .refine((year) => Object.hasOwn(TAX_PARAMETERS, year));

/** 暦として存在する日付（YYYY-MM-DD。13月・2月30日・平年の2月29日は通さない）。 */
export const CalendarDateSchema = z.iso.date();

/** 取引の収入区分。 */
export const IncomeTypeSchema = z.enum(["business", "real_estate", "other"]);

/** PostgreSQL の integer 列の上限。ID をこの範囲で受け、範囲外を DB エラーにしない。 */
const maxInt4 = 2_147_483_647;

/** パスで受ける数値 ID（文字列で届くので受け取り時に数値にする）。 */
export const IdSchema = z.coerce.number().int().positive().max(maxInt4);

/** パスで受ける対象年（西暦）。申告ステータス・提出の記録・納税者情報などの年度別の保存に使う。 */
export const YearSchema = z.coerce.number().int().min(1900).max(2200);
