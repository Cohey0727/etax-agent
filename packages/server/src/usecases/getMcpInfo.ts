/**
 * getMcpInfo.ts — MCP 設定画面向けの接続情報（usecases）。
 * エンドポイントのパスと、公開しているツールの一覧・件数を返す。
 * ツールの正本は services/mcp の MCP_TOOLS で、ここはそれを写すだけ。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { currentUserId } from "../lib/tenantContext";
import { McpInfoResponseSchema } from "../schemas/auth";
import { ErrorSchema } from "../schemas/common";
import { MCP_TOOLS } from "../services/mcp/mcpTools";

export const getMcpInfoRoute = createRoute({
  method: "get",
  path: "/api/auth/mcp-info",
  operationId: "getMcpInfo",
  tags: ["Auth"],
  summary: "MCP のエンドポイントと公開ツール一覧",
  responses: {
    200: {
      content: { "application/json": { schema: McpInfoResponseSchema } },
      description: "MCP のエンドポイントと公開ツール一覧",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ログインしていない",
    },
  },
});

export const getMcpInfoHandler: RouteHandler<typeof getMcpInfoRoute> = async (c) => {
  if (currentUserId() === undefined) {
    throw new HTTPException(401, { message: "ログインしていません" });
  }
  const tools = MCP_TOOLS.map((tool) => ({ name: tool.name, description: tool.description }));
  return c.json({ endpoint_path: "/mcp", tool_count: tools.length, tools }, 200);
};
