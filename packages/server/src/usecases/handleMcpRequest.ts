/**
 * handleMcpRequest.ts — MCP エンドポイント（/mcp）のハンドラ（usecases）。
 *
 * 外部エージェント（MCP クライアント）向けの口。Streamable HTTP の
 * ステートレス運用（セッションなし・JSON レスポンス）で、リクエストごとに
 * サーバーとトランスポートを作って捨てる。
 *
 * 認証: ユーザーごとの API トークン（Bearer）。トークンは設定画面の
 * 「外部エージェント連携（MCP）」で発行し、DB にはハッシュのみを保存する
 * （usecases/authApiKeys、repositories/userRepository の createApiKey）。
 * 認証ミドルウェア（index.ts）が Bearer トークンからユーザーを解決して
 * テナント文脈を載せるため、ツールはそのユーザーのデータだけを扱う。
 * サインアップ/ログイン等の認証フロー自体は MCP の対象外で、このトークンが
 * それを代替する（API キーの発行・取消もトークンでは行わず、ログイン済みの
 * 設定画面でのみ行う）。
 *
 * マスタートークン: 環境変数 MCP_TOKEN が設定されている場合は、ユーザー解決ができて
 * いないリクエストに対してそのマスタートークンも受け付ける（単一テナント
 * のローカル運用向け）。ETAX_AUTH_MODE=required のときは、どちらの方法でも
 * 認証できないリクエストを 401 にする（ミドルウェアでも拒否する二重化）。
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Handler } from "hono";
import { loadMcpConfig } from "../lib/config";
import { authRequired, currentUserId } from "../lib/tenantContext";
import { createMcpServer } from "../services/mcp/mcpServer";

export const handleMcpRequest: Handler = async (c) => {
  // ミドルウェアが API トークン（またはセッション）からユーザーを解決して
  // いれば、そのユーザーのテナント文脈のまま処理する。
  if (currentUserId() === undefined) {
    const { token } = loadMcpConfig();
    const authorization = c.req.header("authorization") ?? "";
    const masterTokenOk = token !== "" && authorization === `Bearer ${token}`;
    if (!masterTokenOk && (token !== "" || authRequired())) {
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
