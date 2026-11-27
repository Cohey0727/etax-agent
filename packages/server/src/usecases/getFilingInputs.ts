/**
 * getFilingInputs.ts — 対象年の申告入力を取得する（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import { getFilingInputRow } from "../repositories/filingInputRepository";
import { FilingInputsResponseSchema, FilingInputsYearParamSchema } from "../schemas/filingInputs";

export const getFilingInputsRoute = createRoute({
  method: "get",
  path: "/api/filing-inputs/{year}",
  operationId: "getFilingInputs",
  tags: ["FilingInputs"],
  summary: "対象年の申告入力を取得（DB必須）",
  request: { params: FilingInputsYearParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: FilingInputsResponseSchema } },
      description: "対象年の申告入力",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const getFilingInputsHandler: RouteHandler<typeof getFilingInputsRoute> = async (c) => {
  const db = requireDb();
  const { year } = c.req.valid("param");
  const row = await getFilingInputRow(db, year);
  if (!row) return c.json({ year, state: null, updated_at: null }, 200);
  let state: unknown = null;
  try {
    state = JSON.parse(row.state) as unknown;
  } catch {
    state = null;
  }
  return c.json({ year, state, updated_at: row.updatedAt.toISOString() }, 200);
};
