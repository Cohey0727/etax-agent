/**
 * getBusinessStartInputs.ts — 開業届・青色申告承認申請書の専用入力を取得する（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import { getBusinessStartInputRow } from "../repositories/businessStartRepository";
import {
  BusinessStartInputsResponse,
  BusinessStartInputsResponseSchema,
  BusinessStartInputsSchema,
} from "../schemas/businessStart";

export const getBusinessStartInputsRoute = createRoute({
  method: "get",
  path: "/api/business-start-inputs",
  operationId: "getBusinessStartInputs",
  tags: ["BusinessStart"],
  summary: "開業届・青色申告承認申請書の専用入力を取得（DB必須）",
  responses: {
    200: {
      content: { "application/json": { schema: BusinessStartInputsResponseSchema } },
      description: "開業届・青色申告承認申請書の専用入力",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const getBusinessStartInputsHandler: RouteHandler<
  typeof getBusinessStartInputsRoute
> = async (c) => {
  const db = requireDb();
  const row = await getBusinessStartInputRow(db);
  if (!row) return c.json({ state: null, updated_at: null }, 200);
  // 保存時に検証済みだが、読み出しでも形を確認し、壊れていれば未保存として扱う。
  let stored: unknown = null;
  try {
    stored = JSON.parse(row.state);
  } catch {
    stored = null;
  }
  const parsed = BusinessStartInputsSchema.safeParse(stored);
  const response: BusinessStartInputsResponse = {
    state: parsed.success ? parsed.data : null,
    updated_at: row.updatedAt.toISOString(),
  };
  return c.json(response, 200);
};
