/**
 * updateClassificationHistory.ts — AIのメモリー（学習履歴）の科目変更ユースケース。
 * 設定画面の「AIのメモリー」から、学習した対応の科目を付け替える。
 * 自動生成ルールと jev 用プロンプトは履歴から都度生成されるため、
 * ここを直せば追随する。結果として履歴の一覧（整形済み）を返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { updateClassificationAccount } from "../repositories/classificationHistoryRepository";
import {
  ClassificationHistoryResponseSchema,
  UpdateClassificationHistoryRequestSchema,
} from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { toHistoryListing } from "../services/classification/historyListing";

export const updateClassificationHistoryRoute = createRoute({
  method: "put",
  path: "/api/classify/history",
  operationId: "updateClassificationHistory",
  tags: ["Classify"],
  summary: "学習した対応の科目を変更する",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: UpdateClassificationHistoryRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ClassificationHistoryResponseSchema } },
      description: "変更後の学習履歴の一覧",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の対応が無い",
    },
  },
});

export const updateClassificationHistoryHandler: RouteHandler<
  typeof updateClassificationHistoryRoute
> = async (c) => {
  const body = c.req.valid("json");
  const records = await updateClassificationAccount(body.description, body.account, body.newAccount);
  if (!records) {
    throw new HTTPException(404, { message: "対象の学習履歴が見つかりません" });
  }
  return c.json(toHistoryListing(records), 200);
};
