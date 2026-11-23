/**
 * getFilingInputs.ts — 対象年の申告入力を取得する（usecases）。
 */
import { createRoute, RouteHandler, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { getFilingInputRow } from "../repositories/filingInputRepository";
import { FilingInputsResponseSchema } from "../schemas/filingInputs";

export const getFilingInputsRoute = createRoute({
  method: "get",
  path: "/api/filing-inputs/{year}",
  request: { params: z.object({ year: z.string() }) },
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
  const year = Number(c.req.param("year"));
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new HTTPException(400, { message: "year が不正です" });
  }
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
