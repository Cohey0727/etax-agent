/**
 * getFilingInputs.ts — 対象年の申告入力を取得する（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { getFilingInputRow } from "../repositories/filingInputRepository";
import { FilingInputsResponseSchema, FilingInputsYearParamSchema } from "../schemas/filingInputs";

export const getFilingInputsRoute = createRoute({
  method: "get",
  path: "/api/filing-inputs/{year}",
  request: { params: FilingInputsYearParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: FilingInputsResponseSchema } },
      description: "対象年の申告入力",
    },
  },
});

export const getFilingInputsHandler: RouteHandler<typeof getFilingInputsRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const { year } = c.req.valid("param");
  const row = await getFilingInputRow(db, year);
  if (!row) return c.json({ year, state: null, updated_at: null });
  let state: unknown = null;
  try {
    state = JSON.parse(row.state) as unknown;
  } catch {
    state = null;
  }
  return c.json({ year, state, updated_at: row.updatedAt.toISOString() });
};
