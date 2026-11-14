/**
 * recordClassificationFeedback.ts — 科目判定の学習ユースケース（usecases）。
 * ユーザーが確定した「摘要 → 勘定科目」を学習履歴に記録し、
 * 次回以降の判定で「過去の傾向」として優先利用できるようにする。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { recordClassification } from "../repositories/classificationHistoryRepository";
import {
  RecordClassificationFeedbackRequestSchema,
  RecordClassificationFeedbackResponseSchema,
} from "../schemas/classify";
import { ErrorSchema } from "../schemas/common";

export const recordClassificationFeedbackRoute = createRoute({
  method: "post",
  path: "/api/classify/feedback",
  operationId: "recordClassificationFeedback",
  tags: ["Classify"],
  summary: "確定した科目を学習履歴に記録",
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: RecordClassificationFeedbackRequestSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: RecordClassificationFeedbackResponseSchema },
      },
      description: "記録結果",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const recordClassificationFeedbackHandler: RouteHandler<
  typeof recordClassificationFeedbackRoute
> = async (c) => {
  const body = c.req.valid("json");
  const records = await recordClassification(body.description, body.account);
  return c.json({ recorded: true, totalRecords: records.length }, 200);
};
