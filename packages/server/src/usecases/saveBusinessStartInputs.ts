/**
 * saveBusinessStartInputs.ts — 開業届・青色申告承認申請書の専用入力を保存する（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { upsertBusinessStartInputRow } from "../repositories/businessStartRepository";
import {
  BusinessStartInputsResponse,
  BusinessStartInputsResponseSchema,
  BusinessStartInputsSchema,
  SaveBusinessStartInputsRequestSchema,
} from "../schemas/businessStart";

export const saveBusinessStartInputsRoute = createRoute({
  method: "put",
  path: "/api/business-start-inputs",
  request: {
    body: {
      content: { "application/json": { schema: SaveBusinessStartInputsRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: BusinessStartInputsResponseSchema } },
      description: "保存した専用入力",
    },
  },
});

export const saveBusinessStartInputsHandler: RouteHandler<
  typeof saveBusinessStartInputsRoute
> = async (c) => {
  const db = requireDb();
  const body = (await c.req.json().catch(() => null)) as { state?: unknown } | null;
  const parsed = BusinessStartInputsSchema.safeParse(body?.state);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "専用入力の形が不正です" });
  }
  const row = await upsertBusinessStartInputRow(db, parsed.data);
  const response: BusinessStartInputsResponse = {
    state: parsed.data,
    updated_at: row.updatedAt.toISOString(),
  };
  return c.json(response);
};
