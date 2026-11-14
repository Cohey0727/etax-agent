/**
 * health.ts — 疎通確認エンドポイントのスキーマ（schemas）。
 */
import { z } from "@hono/zod-openapi";

export const HealthResponseSchema = z
  .object({
    ok: z.boolean(),
    service: z.string(),
    dbConfigured: z.boolean(),
    agentConfigured: z.boolean(),
    agentSchema: z.string().nullable(),
    storageConfigured: z.boolean(),
  })
  .openapi("Health");

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
