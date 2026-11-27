/**
 * classifyAccount.ts — 勘定科目の判定ユースケース（usecases）。
 * 自動生成ルール → SystemOne（プロンプト）→ キーワードルールの順で判定する。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import {
  AccountClassificationSchema,
  ClassifyAccountRequestSchema,
} from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { classifyAccount } from "../services/classification/classifyAccount";
import { loadClassifyDeps } from "../services/classification/loadClassifyDeps";

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
  return c.json(await classifyAccount(body.description, await loadClassifyDeps()), 200);
};
