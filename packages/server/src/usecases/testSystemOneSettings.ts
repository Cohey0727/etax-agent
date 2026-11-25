/**
 * testSystemOneSettings.ts — SystemOne（jev）接続テストのユースケース。
 * 処理の本体は services/classification/testSystemOneConnection（MCP の
 * test_systemone_connection ツールと共用）。ここはルート定義と、
 * 結果をそのまま返す薄いハンドラだけを持つ。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import {
  TestSystemOneSettingsRequestSchema,
  TestSystemOneSettingsResponseSchema,
} from "../schemas/systemOneSettings";
import { ErrorSchema } from "../schemas/common";
import { testSystemOneConnection } from "../services/classification/testSystemOneConnection";

export const testSystemOneSettingsRoute = createRoute({
  method: "post",
  path: "/api/settings/systemone/test",
  operationId: "testSystemOneSettings",
  tags: ["Settings"],
  summary: "SystemOne（jev）接続テスト",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: TestSystemOneSettingsRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: TestSystemOneSettingsResponseSchema } },
      description: "接続テストの結果",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const testSystemOneSettingsHandler: RouteHandler<
  typeof testSystemOneSettingsRoute
> = async (c) => {
  return c.json(await testSystemOneConnection(c.req.valid("json")), 200);
};
