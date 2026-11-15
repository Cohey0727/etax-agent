/**
 * classifyAccountsBatch.ts — 勘定科目の一括判定ユースケース（usecases）。
 * カード明細CSVの行など、複数行をまとめて判定する。
 * SystemOne への呼び出しが支配的にならないよう、履歴とルールで決まる行は
 * 先に確定し、残りだけを逐次 SystemOne に投げる。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { createSystemOneClient } from "../gateways/systemOneGateway";
import { getJevPromptOverride, getRegexRulesOverride, loadSystemOneConfig } from "../lib/config";
import { loadClassificationHistory } from "../repositories/classificationHistoryRepository";
import {
  ClassifyAccountsBatchRequestSchema,
  ClassifyAccountsBatchResponseSchema,
} from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { classifyAccount } from "../services/classification/classifyAccount";

export const classifyAccountsBatchRoute = createRoute({
  method: "post",
  path: "/api/classify/batch",
  operationId: "classifyAccountsBatch",
  tags: ["Classify"],
  summary: "勘定科目の一括判定",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ClassifyAccountsBatchRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ClassifyAccountsBatchResponseSchema } },
      description: "判定結果（入力と同じ順序）",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const classifyAccountsBatchHandler: RouteHandler<
  typeof classifyAccountsBatchRoute
> = async (c) => {
  const body = c.req.valid("json");
  const history = await loadClassificationHistory();
  const systemOne = createSystemOneClient(loadSystemOneConfig());
  const results = [];
  for (const item of body.items) {
    results.push(await classifyAccount(item.description, { history, systemOne, jevPromptOverride: getJevPromptOverride(), regexRulesOverride: getRegexRulesOverride() }));
  }
  return c.json({ results }, 200);
};
