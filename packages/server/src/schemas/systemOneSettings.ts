/**
 * systemOneSettings.ts — SystemOne（jev）接続設定APIのスキーマ（schemas）。
 * APIキーの実値はレスポンスに含めない（設定済みかどうかだけを返す）。
 */
import { z } from "@hono/zod-openapi";

const keyField = z.string().max(500).optional();

export const SystemOneSettingsResponseSchema = z
  .object({
    /** 設定画面で保存された値（未保存なら空文字）。 */
    baseUrl: z.string(),
    model: z.string(),
    /** APIキーが保存済みかどうか（実値は返さない）。 */
    apiKeySet: z.boolean(),
    /** いま実際に使われる値（保存値 → 環境変数 → デフォルト）。 */
    effectiveBaseUrl: z.string(),
    effectiveModel: z.string().nullable(),
  })
  .openapi("SystemOneSettingsResponse");

export type SystemOneSettingsResponse = z.infer<typeof SystemOneSettingsResponseSchema>;

export const UpdateSystemOneSettingsRequestSchema = z
  .object({
    /** 空文字なら未保存に戻す（環境変数を使う）。 */
    baseUrl: z.string().max(500),
    model: z.string().max(200),
    /** 省略または空文字なら既存のキーを維持する。 */
    apiKey: keyField,
    /** true なら保存済みAPIキーを削除する。 */
    clearApiKey: z.boolean().optional(),
  })
  .openapi("UpdateSystemOneSettingsRequest");

export type UpdateSystemOneSettingsRequest = z.infer<
  typeof UpdateSystemOneSettingsRequestSchema
>;

export const TestSystemOneSettingsRequestSchema = z
  .object({
    /** 省略した項目は現在の有効値でテストする（保存前の確認用）。 */
    baseUrl: z.string().max(500).optional(),
    model: z.string().max(200).optional(),
    apiKey: keyField,
  })
  .openapi("TestSystemOneSettingsRequest");

export const TestSystemOneSettingsResponseSchema = z
  .object({
    ok: z.boolean(),
    /** 判定できた場合の最上位の科目。 */
    top: z.string().nullable(),
    /** 失敗した場合の理由。 */
    error: z.string().nullable(),
  })
  .openapi("TestSystemOneSettingsResponse");

export type TestSystemOneSettingsResponse = z.infer<
  typeof TestSystemOneSettingsResponseSchema
>;
