/**
 * testAgentSettings.ts — 外部接続（AI）の接続テストのユースケース。
 * 設定画面の未保存の値でもテストできるよう、送られた項目だけサーバーの
 * 現在の設定に上書きして、最小の生成リクエストを1回投げる。
 * 上書きの規則は runAgentChat の agentConfig 上書きと同じ。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { generateText } from "ai";
import { createAgentModel } from "../gateways/agentModelGateway";
import { AgentConfig, loadAgentConfig } from "../lib/config";
import {
  TestAgentSettingsRequestSchema,
  TestAgentSettingsResponseSchema,
} from "../schemas/agentSettings";
import { ErrorSchema } from "../schemas/common";

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
  const body = c.req.valid("json");
  let cfg: AgentConfig;
  try {
    cfg = loadAgentConfig();
  } catch (e) {
    return c.json(
      { ok: false, model: null, reply: null, error: e instanceof Error ? e.message : String(e) },
      200,
    );
  }
  const typedKey = body.apiKey?.trim() ?? "";
  if (typedKey) cfg.apiKey = typedKey;
  if (body.baseUrl?.trim()) cfg.baseUrl = body.baseUrl.trim().replace(/\/+$/, "");
  if (body.model?.trim()) cfg.model = body.model.trim();
  if (!cfg.apiKey) {
    return c.json(
      {
        ok: false,
        model: cfg.model,
        reply: null,
        error: "APIキーが未設定です（サーバーの環境変数か、この画面で入力してください）",
      },
      200,
    );
  }
  try {
    const result = await generateText({
      model: createAgentModel(cfg),
      prompt: "接続テストです。「OK」とだけ返してください。",
      abortSignal: AbortSignal.timeout(30_000),
    });
    return c.json(
      { ok: true, model: cfg.model, reply: result.text.trim().slice(0, 100) || null, error: null },
      200,
    );
  } catch (e) {
    return c.json(
      { ok: false, model: cfg.model, reply: null, error: e instanceof Error ? e.message : String(e) },
      200,
    );
  }
};
