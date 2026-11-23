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
    {
      capabilities: { tools: {} },
      instructions:
        "eTaxAgent は確定申告の「決定的な計算エンジン＋帳簿＋XTX生成」です。" +
        "ツールが返すのは帳簿データの集計・税額計算・申告データ生成の結果だけで、" +
        "個別の取引や事案に対する税務判断（経費にできるか、課税か非課税か等）は返しません。" +
        "個別判断が必要な相談には、計算結果と一般的な制度説明までを示し、" +
        "最終判断は税理士へ相談するよう利用者に案内してください。" +
        "e-Tax への提出は納税者本人が行うもので、このサーバーは提出を代行しません。",
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await dispatchMcpTool(request.params.name, request.params.arguments ?? {});
    return result as CallToolResult;
  });
  return server;
}
