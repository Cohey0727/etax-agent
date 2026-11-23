/**
 * handleMcpRequest.ts — MCP エンドポイント（/mcp）のハンドラ（usecases）。
 *
 * 外部エージェント（MCP クライアント）向けの口。Streamable HTTP の
 * ステートレス運用（セッションなし・JSON レスポンス）で、リクエストごとに
 * サーバーとトランスポートを作って捨てる。
 *
 * 認証: MCP_TOKEN が設定されていれば Bearer トークンを必須にする。
 * 未設定なら認証なし（ローカル前提。公開時は必ず設定すること）。
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Handler } from "hono";
import { loadMcpConfig } from "../lib/config";
import { createMcpServer } from "../services/mcp/mcpServer";

export const handleMcpRequest: Handler = async (c) => {
  const { token } = loadMcpConfig();
  if (token !== "") {
    const authorization = c.req.header("authorization") ?? "";
    if (authorization !== `Bearer ${token}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
};
