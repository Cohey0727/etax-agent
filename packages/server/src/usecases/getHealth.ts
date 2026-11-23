/**
 * getHealth.ts — 疎通確認ユースケース（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { loadAgentConfig, loadStorageConfig } from "../lib/config";
import { isDatabaseConfigured } from "../lib/db";
import { HealthResponse, HealthResponseSchema } from "../schemas/health";

export const getHealthRoute = createRoute({
  method: "get",
  path: "/api/health",
  operationId: "getHealth",
  tags: ["Health"],
  summary: "疎通確認（DB・LLMの設定有無も返す）",
  responses: {
    200: {
      content: { "application/json": { schema: HealthResponseSchema } },
      description: "サーバー状態",
    },
  },
});

export const getHealthHandler: RouteHandler<typeof getHealthRoute> = (c) => {
  let agentConfigured = false;
  let agentSchema: string | null = null;
  try {
    const cfg = loadAgentConfig();
    agentConfigured = Boolean(cfg.apiKey);
    agentSchema = cfg.schema;
  } catch {
    agentSchema = null;
  }
  const response: HealthResponse = {
    ok: true,
    service: "etax-agent",
    dbConfigured: isDatabaseConfigured(),
    agentConfigured,
    agentSchema,
    storageConfigured: loadStorageConfig().configured,
  };
  return c.json(response, 200);
};
