/**
 * classifyAccount.ts — 勘定科目の判定ユースケース（usecases）。
 * 過去の傾向（学習履歴）→ SystemOne → キーワードルールの順で判定する。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { createSystemOneClient } from "../gateways/systemOneGateway";
import { getJevPromptOverride, loadSystemOneConfig } from "../lib/config";
import { loadClassificationHistory } from "../repositories/classificationHistoryRepository";
import {
  AccountClassificationSchema,
  ClassifyAccountRequestSchema,
} from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { classifyAccount } from "../services/classification/classifyAccount";

export const classifyAccountRoute = createRoute({
  method: "post",
  path: "/api/classify/account",
  operationId: "classifyAccount",
  tags: ["Classify"],
  summary: "勘定科目の判定（履歴→SystemOne→ルール）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ClassifyAccountRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AccountClassificationSchema } },
      description: "判定結果",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const classifyAccountHandler: RouteHandler<typeof classifyAccountRoute> = async (c) => {
  const body = c.req.valid("json");
  const history = await loadClassificationHistory();
  const systemOne = createSystemOneClient(loadSystemOneConfig());
  const result = await classifyAccount(body.description, { history, systemOne, jevPromptOverride: getJevPromptOverride() });
  return c.json(result, 200);
};
