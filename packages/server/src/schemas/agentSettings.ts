/**
 * agentSettings.ts — 外部接続（AI）接続テストAPIのスキーマ（schemas）。
 * テストは設定画面の未保存の値でも試せるよう、項目はすべて任意。
 * 省略した項目はサーバーの現在の設定（環境変数）で補う。
 */
import { z } from "@hono/zod-openapi";

const keyField = z.string().max(500).optional();

export const TestAgentSettingsRequestSchema = z
  .object({
    baseUrl: z.string().max(500).optional(),
    model: z.string().max(200).optional(),
    apiKey: keyField,
  })
  .openapi("TestAgentSettingsRequest");

export const TestAgentSettingsResponseSchema = z
  .object({
    ok: z.boolean(),
    /** テストに使ったモデル名。 */
    model: z.string().nullable(),
    /** モデルからの応答（先頭だけ）。 */
    reply: z.string().nullable(),
    /** 失敗した場合の理由。 */
    error: z.string().nullable(),
  })
  .openapi("TestAgentSettingsResponse");

export type TestAgentSettingsResponse = z.infer<typeof TestAgentSettingsResponseSchema>;
