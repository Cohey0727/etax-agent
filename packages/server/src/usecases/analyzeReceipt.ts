/**
 * analyzeReceipt.ts — 領収書画像の解析ユースケース（usecases）。
 * 画像対応LLMで日付・金額・支払先・摘要を読み取り、続けて勘定科目を
 * 判定して「帳簿ドラフト」を返す。帳簿への追加は画面側の確定操作で行う。
 *
 * 画像の受け取りは2経路:
 *   1. fileId: アップロード受け口URLでローカル保存済みのもの。
 *      サーバーが内部エンドポイントから取得する。
 *   2. imageBase64 + mimeType: 画像を直接渡す（ストレージ未設定時のフォールバック）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { getDb } from "../lib/db";
import { ErrorSchema } from "../schemas/common";
import {
  AnalyzeReceiptRequestSchema,
  AnalyzeReceiptResponse,
  AnalyzeReceiptResponseSchema,
} from "../schemas/receipt";
import { analyzeReceiptDraft } from "../services/receipts/analyzeReceiptDraft";

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
      description: "JSONボディが不正・指定が不足",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "fileId のファイルが存在しない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "LLM未設定・ストレージ未設定・読み取り失敗",
    },
  },
});

export const analyzeReceiptHandler: RouteHandler<typeof analyzeReceiptRoute> = async (c) => {
  const body = c.req.valid("json");
  const result: AnalyzeReceiptResponse = await analyzeReceiptDraft(getDb(), {
    fileId: body.fileId,
    imageBase64: body.imageBase64,
    mimeType: body.mimeType,
  });
  return c.json(result, 200);
};
