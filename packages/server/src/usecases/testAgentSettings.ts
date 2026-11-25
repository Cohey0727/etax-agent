/**
 * testAgentSettings.ts — 外部接続（AI）の接続テストのユースケース。
 * 処理の本体は services/agent/testAgentConnection（MCP の
 * test_agent_connection ツールと共用）。ここはルート定義と、
 * 結果をそのまま返す薄いハンドラだけを持つ。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import {
  TestAgentSettingsRequestSchema,
  TestAgentSettingsResponseSchema,
} from "../schemas/agentSettings";
import { ErrorSchema } from "../schemas/common";
import { testAgentConnection } from "../services/agent/testAgentConnection";

export const testAgentSettingsRoute = createRoute({
  method: "post",
  path: "/api/settings/agent/test",
  operationId: "testAgentSettings",
  tags: ["Settings"],
  summary: "外部接続（AI）の接続テスト",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TestAgentSettingsRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TestAgentSettingsResponseSchema } },
      description: "接続テストの結果",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const testAgentSettingsHandler: RouteHandler<typeof testAgentSettingsRoute> = async (c) => {
  return c.json(await testAgentConnection(c.req.valid("json")), 200);
};
