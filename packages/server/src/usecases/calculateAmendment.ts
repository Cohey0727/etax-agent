/**
 * calculateAmendment.ts — 修正申告の差分ユースケース（usecases）。
 * DB不要・ステートレス。計算は @etax/shared の決定的な関数が行う。
 */
import { amendmentDelta } from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import {
  CalculateAmendmentRequestSchema,
  CalculateAmendmentResponse,
  CalculateAmendmentResponseSchema,
} from "../schemas/calc";
import { ErrorSchema } from "../schemas/common";

export const calculateAmendmentRoute = createRoute({
  method: "post",
  path: "/api/calc/amend",
  operationId: "calculateAmendment",
  tags: ["Calc"],
  summary: "修正申告の差分（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CalculateAmendmentRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CalculateAmendmentResponseSchema } },
      description: "申告済みと修正後の差分",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正、または original / corrected が不足",
    },
  },
});

/**
 * バリデーション失敗時の文言を決める。
 * original / corrected の不備はその旨、それ以外（JSONとして読めない等）はボディ不備。
 */
export function calculateAmendmentValidationMessage(issuePaths: string[]): string {
  if (issuePaths.some((p) => p === "original" || p === "corrected" || p.startsWith("original.") || p.startsWith("corrected."))) {
    return "original と corrected（JSONオブジェクト）が必要です";
  }
  return "JSONボディが必要です";
}

export const calculateAmendmentHandler: RouteHandler<typeof calculateAmendmentRoute> = (c) => {
  const body = c.req.valid("json");
  const year = typeof body.year === "number" ? body.year : 0;
  const d = amendmentDelta(body.original, body.corrected, year);
  const response: CalculateAmendmentResponse = {
    year: d.year,
    field_diffs: d.fieldDiffs,
    tax_delta: d.taxDelta,
  };
  return c.json(response, 200);
};
