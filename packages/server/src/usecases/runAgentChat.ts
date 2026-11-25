/**
 * runAgentChat.ts — 対話エージェントユースケース（要 AGENT_API_KEY）。
 *
 * 処理の本体は services/agent/executeAgentChat（MCP の agent_chat ツールと
 * 共用）。ボディ検証は本体側で行う: 設定読込（500）とキー未設定（503）を
 * バリデーションの 400 より先に返す従来順序を保つため（ルート定義に
 * ボディは置かない）。ここはルート定義と、本体の失敗を HTTP ステータスへ
 * 変換する薄いハンドラだけを持つ。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { readJsonBody } from "../lib/readJsonBody";
import { AgentChatResponseSchema } from "../schemas/agentChat";
import { ErrorSchema } from "../schemas/common";
import { AgentChatError, executeAgentChat } from "../services/agent/executeAgentChat";

export const runAgentChatRoute = createRoute({
  method: "post",
  path: "/api/agent/chat",
  operationId: "runAgentChat",
  tags: ["Agent"],
  summary: "対話エージェント（要 AGENT_API_KEY）",
  responses: {
    200: {
      content: { "application/json": { schema: AgentChatResponseSchema } },
      description: "エージェント応答",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "messages 配列が不足・添付ファイルが不正",
    },
    500: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "設定不備または内部エラー",
    },
    502: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "LLM 呼び出し失敗",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "AGENT_API_KEY 未設定",
    },
  },
});

export const runAgentChatHandler: RouteHandler<typeof runAgentChatRoute> = async (c) => {
  const raw = await readJsonBody(c);
  try {
    return c.json(await executeAgentChat(raw), 200);
  } catch (e) {
    if (e instanceof AgentChatError) {
      throw new HTTPException(e.status, { message: e.message });
    }
    throw e;
  }
};
