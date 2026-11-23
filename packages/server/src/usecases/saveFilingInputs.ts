/**
 * saveFilingInputs.ts — 対象年の申告入力を保存する（usecases）。
 */
import { createRoute, RouteHandler, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { upsertFilingInputRow } from "../repositories/filingInputRepository";
import {
  FilingInputsResponseSchema,
  SaveFilingInputsRequestSchema,
} from "../schemas/filingInputs";

export const saveFilingInputsRoute = createRoute({
  method: "put",
  path: "/api/filing-inputs/{year}",
  request: {
    params: z.object({ year: z.string() }),
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
  },
});

export const saveFilingInputsHandler: RouteHandler<typeof saveFilingInputsRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const year = Number(c.req.param("year"));
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new HTTPException(400, { message: "year が不正です" });
  }
  const body = (await c.req.json().catch(() => null)) as { state?: unknown } | null;
  if (!body || typeof body.state !== "object" || body.state === null) {
    throw new HTTPException(400, { message: "state はオブジェクトで指定してください" });
  }
  const row = await upsertFilingInputRow(db, year, body.state);
  return c.json({ year, state: body.state, updated_at: row.updatedAt.toISOString() });
};
