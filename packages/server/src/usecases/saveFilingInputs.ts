/**
 * saveFilingInputs.ts — 対象年の申告入力を保存する（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { upsertFilingInputRow } from "../repositories/filingInputRepository";
import {
  FilingInputsResponseSchema,
  FilingInputsYearParamSchema,
  SaveFilingInputsRequestSchema,
} from "../schemas/filingInputs";

export const saveFilingInputsRoute = createRoute({
  method: "put",
  path: "/api/filing-inputs/{year}",
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
  },
});

export const saveFilingInputsHandler: RouteHandler<typeof saveFilingInputsRoute> = async (c) => {
  const db = requireDb();
  const { year } = c.req.valid("param");
  const body = (await c.req.json().catch(() => null)) as { state?: unknown } | null;
  if (!body || typeof body.state !== "object" || body.state === null) {
    throw new HTTPException(400, { message: "state はオブジェクトで指定してください" });
  }
  const row = await upsertFilingInputRow(db, year, body.state);
  return c.json({ year, state: body.state, updated_at: row.updatedAt.toISOString() });
};
