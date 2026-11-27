/**
 * saveBusinessStartInputs.ts — 開業届・青色申告承認申請書の専用入力を保存する（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import { upsertBusinessStartInputRow } from "../repositories/businessStartRepository";
import {
  BusinessStartInputsResponse,
  BusinessStartInputsResponseSchema,
  SaveBusinessStartInputsRequestSchema,
} from "../schemas/businessStart";

export const saveBusinessStartInputsRoute = createRoute({
  method: "put",
  path: "/api/business-start-inputs",
  operationId: "saveBusinessStartInputs",
  tags: ["BusinessStart"],
  summary: "開業届・青色申告承認申請書の専用入力を保存（DB必須）",
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
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "専用入力の形が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const saveBusinessStartInputsHandler: RouteHandler<
  typeof saveBusinessStartInputsRoute
> = async (c) => {
  const db = requireDb();
  const { state } = c.req.valid("json");
  const row = await upsertBusinessStartInputRow(db, state);
  const response: BusinessStartInputsResponse = {
    state,
    updated_at: row.updatedAt.toISOString(),
  };
  return c.json(response, 200);
};
