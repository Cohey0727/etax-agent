/**
 * analyzeReceipt.ts — 領収書画像の解析ユースケース（usecases）。
 * 画像対応LLMで日付・金額・支払先・摘要を読み取り、続けて勘定科目を
 * 判定して「帳簿ドラフト」を返す。帳簿への追加は画面側の確定操作で行う。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createLlmClient } from "../gateways/llmGateway";
import { createSystemOneClient } from "../gateways/systemOneGateway";
import { loadAgentConfig, loadSystemOneConfig } from "../lib/config";
import { loadClassificationHistory } from "../repositories/classificationHistoryRepository";
import { ErrorSchema } from "../schemas/common";
import { AnalyzeReceiptRequestSchema, AnalyzeReceiptResponseSchema } from "../schemas/receipt";
import { classifyAccount } from "../services/classification/classifyAccount";
import { extractReceipt } from "../services/receipts/extractReceipt";

export const analyzeReceiptRoute = createRoute({
  method: "post",
  path: "/api/receipts/analyze",
  operationId: "analyzeReceipt",
  tags: ["Receipts"],
  summary: "領収書画像の読み取り＋科目判定",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: AnalyzeReceiptRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AnalyzeReceiptResponseSchema } },
      description: "帳簿ドラフト",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "LLM未設定・読み取り失敗",
    },
  },
});

export const analyzeReceiptHandler: RouteHandler<typeof analyzeReceiptRoute> = async (c) => {
  const body = c.req.valid("json");
  const agentConfig = loadAgentConfig();
  if (!agentConfig.apiKey) {
    throw new HTTPException(503, {
      message: "AGENT_API_KEY が設定されていないため、画像の読み取りができません",
    });
  }
  const llm = createLlmClient(agentConfig);
  let extracted;
  try {
    extracted = await extractReceipt(
      { mimeType: body.mimeType, dataBase64: body.imageBase64 },
      llm,
    );
  } catch (e) {
    throw new HTTPException(503, {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  const state = [extracted.payee, extracted.description].filter(Boolean).join(" ");
  const history = await loadClassificationHistory();
  const systemOne = createSystemOneClient(loadSystemOneConfig());
  const classification = await classifyAccount(state || extracted.description, {
    history,
    systemOne,
  });
  return c.json({ ...extracted, classification }, 200);
};
