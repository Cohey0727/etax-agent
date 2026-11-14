/**
 * runAgentChat.ts — 対話エージェントユースケース（usecases）。要 AGENT_API_KEY。
 *
 * ボディ検証はハンドラ側で行う: 設定読込（500）とキー未設定（503）を
 * バリデーションの 400 より先に返す従来順序を保つため
 * （ルート定義にボディは置かない）。
 * 会話の実行自体は services/agent の runAgentTurn が担う。
 */
import { normalizeTransactions } from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { AgentConfig, ConfigError, loadAgentConfig } from "../lib/config";
import { errorMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { AgentChatRequestSchema, AgentChatResponse, AgentChatResponseSchema } from "../schemas/agentChat";
import { ErrorSchema } from "../schemas/common";
import { runAgentTurn } from "../services/agent/runAgentTurn";

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
      description: "messages 配列が不足",
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
  let cfg: AgentConfig;
  try {
    cfg = loadAgentConfig();
  } catch (e) {
    throw new HTTPException(500, { message: errorMessage(e) });
  }
  const raw = await readJsonBody(c);
  // 設定画面（外部接続）から送られた接続情報があれば、環境変数より優先する。
  const override = raw?.agentConfig as
    | { apiKey?: unknown; baseUrl?: unknown; model?: unknown }
    | undefined;
  if (override) {
    if (typeof override.apiKey === "string" && override.apiKey.trim()) {
      cfg.apiKey = override.apiKey.trim();
    }
    if (typeof override.baseUrl === "string" && override.baseUrl.trim()) {
      cfg.baseUrl = override.baseUrl.trim().replace(/\/+$/, "");
    }
    if (typeof override.model === "string" && override.model.trim()) {
      cfg.model = override.model.trim();
    }
  }
  if (!cfg.apiKey) {
    throw new HTTPException(503, {
      message:
        "AGENT_API_KEY が未設定のためエージェントは利用できません。サーバーの環境変数に AGENT_API_KEY を設定するか、設定画面の「外部接続」にAPIキーを入力してください（集計・計算・CSV取込はキー不要で使えます）。",
    });
  }
  const parsed = raw === null ? null : AgentChatRequestSchema.safeParse(raw);
  if (!parsed || !parsed.success) {
    throw new HTTPException(400, { message: "messages 配列が必要です" });
  }
  const body = parsed.data;
  const history = (body.messages as unknown[])
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        typeof m === "object" &&
        m !== null &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content }));
  const transactions = normalizeTransactions(body.transactions ?? []);
  const csvText = body.csvText;
  try {
    const result = await runAgentTurn(cfg, history, { transactions, csvText });
    const response: AgentChatResponse = result;
    return c.json(response, 200);
  } catch (e) {
    if (e instanceof ConfigError) throw new HTTPException(503, { message: errorMessage(e) });
    // AI SDK 経由の LLM 呼び出し失敗（HTTPエラー・接続失敗・応答形式異常）は 502。
    throw new HTTPException(502, { message: errorMessage(e) });
  }
};
