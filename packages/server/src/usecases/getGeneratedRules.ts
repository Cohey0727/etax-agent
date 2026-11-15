/**
 * getGeneratedRules.ts — 学習履歴から自動生成した適用ルールの取得ユースケース。
 *
 * 個別に確定・変更された分類（学習履歴）から、その時点で生成される
 * 正規表現ルールと jev 用プロンプトを返す。生成ロジックの正本は
 * services/classification/generateRules で、判定時も同じ生成結果を使う。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { loadClassificationHistory } from "../repositories/classificationHistoryRepository";
import { GeneratedRulesResponseSchema } from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { generateRules } from "../services/classification/generateRules";

export const getGeneratedRulesRoute = createRoute({
  method: "get",
  path: "/api/classify/generated-rules",
  operationId: "getGeneratedRules",
  tags: ["Classify"],
  summary: "学習履歴から自動生成した適用ルール（正規表現＋jev用プロンプト）",
  responses: {
    200: {
      content: { "application/json": { schema: GeneratedRulesResponseSchema } },
      description: "生成された適用ルール",
    },
    500: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "履歴の読み込みに失敗",
    },
  },
});

export const getGeneratedRulesHandler: RouteHandler<typeof getGeneratedRulesRoute> = async (c) => {
  const history = await loadClassificationHistory();
  const generated = generateRules(history);
  return c.json(
    { regexRules: generated.regexRules, jevPrompt: generated.jevPrompt },
    200,
  );
};
