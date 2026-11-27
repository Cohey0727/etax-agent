/**
 * saveFilingInputs.ts — 対象年の申告入力を保存する（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { defaultValidationMessage } from "../lib/validationHook";
import { ErrorSchema } from "../schemas/common";
import { upsertFilingInputRow } from "../repositories/filingInputRepository";
import {
  FilingInputsResponseSchema,
  FilingInputsYearParamSchema,
  SaveFilingInputsRequestSchema,
} from "../schemas/filingInputs";

export const saveFilingInputsRoute = createRoute({
  method: "put",
  path: "/api/filing-inputs/{year}",
  operationId: "saveFilingInputs",
  tags: ["FilingInputs"],
  summary: "対象年の申告入力を保存（DB必須）",
  request: {
    params: FilingInputsYearParamSchema,
    body: {
      content: { "application/json": { schema: SaveFilingInputsRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: FilingInputsResponseSchema } },
      description: "保存した申告入力",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year またはボディが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

/** バリデーション失敗時の文言。state はオブジェクトであることを示す。 */
export function saveFilingInputsValidationMessage(issuePaths: string[]): string {
  if (issuePaths.some((path) => path === "state" || path.startsWith("state."))) {
    return "state はオブジェクトで指定してください";
  }
  return defaultValidationMessage(issuePaths);
}

export const saveFilingInputsHandler: RouteHandler<typeof saveFilingInputsRoute> = async (c) => {
  const db = requireDb();
  const { year } = c.req.valid("param");
  const { state } = c.req.valid("json");
  const row = await upsertFilingInputRow(db, year, state);
  return c.json({ year, state, updated_at: row.updatedAt.toISOString() }, 200);
};
