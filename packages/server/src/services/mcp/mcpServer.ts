/**
 * mcpServer.ts — MCP サーバーの組み立て（services/mcp）。
 *
 * 公式 SDK の低レベル Server にツール一覧と実行ハンドラを差すだけの薄い層。
 * トランスポートは呼び出し側（usecases/handleMcpRequest）がリクエストごとに
 * 作る（ステートレス運用）。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MCP_TOOLS, dispatchMcpTool } from "./mcpTools";

/** eTaxAgent の MCP サーバー（ツール公開のみ）を返す。 */
export function createMcpServer(): Server {
  const server = new Server(
    { name: "etax-agent", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await dispatchMcpTool(request.params.name, request.params.arguments ?? {});
    return result as CallToolResult;
  });
  return server;
}
