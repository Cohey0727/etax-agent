/**
 * getBusinessStartInputs.ts — 開業届・青色申告承認申請書の専用入力を取得する（usecases）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { getBusinessStartInputRow } from "../repositories/businessStartRepository";
import {
  BusinessStartInputsResponse,
  BusinessStartInputsResponseSchema,
  BusinessStartInputsSchema,
} from "../schemas/businessStart";

export const getBusinessStartInputsRoute = createRoute({
  method: "get",
  path: "/api/business-start-inputs",
  responses: {
    200: {
      content: { "application/json": { schema: BusinessStartInputsResponseSchema } },
      description: "開業届・青色申告承認申請書の専用入力",
    },
  },
});

export const getBusinessStartInputsHandler: RouteHandler<
  typeof getBusinessStartInputsRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const row = await getBusinessStartInputRow(db);
  if (!row) return c.json({ state: null, updated_at: null });
  // 保存時に検証済みだが、読み出しでも形を確認し、壊れていれば未保存として扱う。
  const parsed = BusinessStartInputsSchema.safeParse(JSON.parse(row.state) as unknown);
  const response: BusinessStartInputsResponse = {
    state: parsed.success ? parsed.data : null,
    updated_at: row.updatedAt.toISOString(),
  };
  return c.json(response);
};
