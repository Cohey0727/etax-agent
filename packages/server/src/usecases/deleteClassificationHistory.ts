/**
 * deleteClassificationHistory.ts — AIのメモリー（学習履歴）の削除ユースケース。
 * 設定画面の「AIのメモリー」から、学習した対応を1件消す。
 * 結果として履歴の一覧（整形済み）を返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { deleteClassification } from "../repositories/classificationHistoryRepository";
import {
  ClassificationHistoryResponseSchema,
  DeleteClassificationHistoryRequestSchema,
} from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";
import { toHistoryListing } from "../services/classification/historyListing";

export const deleteClassificationHistoryRoute = createRoute({
  method: "delete",
  path: "/api/classify/history",
  operationId: "deleteClassificationHistory",
  tags: ["Classify"],
  summary: "学習した対応を削除する",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: DeleteClassificationHistoryRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ClassificationHistoryResponseSchema } },
      description: "削除後の学習履歴の一覧",
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

export const deleteClassificationHistoryHandler: RouteHandler<
  typeof deleteClassificationHistoryRoute
> = async (c) => {
  const body = c.req.valid("json");
  const records = await deleteClassification(body.description, body.account);
  if (!records) {
    throw new HTTPException(404, { message: "対象の学習履歴が見つかりません" });
  }
  return c.json(toHistoryListing(records), 200);
};
