/**
 * listImports.ts — 取込履歴ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { importToApi, listImportRows } from "../repositories/importRepository";
import { ErrorSchema } from "../schemas/common";
import { ListImportsResponse, ListImportsResponseSchema } from "../schemas/importRecord";

export const listImportsRoute = createRoute({
  method: "get",
  path: "/api/imports",
  operationId: "listImports",
  tags: ["Imports"],
  summary: "取込履歴を取得（DB必須）",
  responses: {
    200: {
      content: { "application/json": { schema: ListImportsResponseSchema } },
      description: "取込履歴",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listImportsHandler: RouteHandler<typeof listImportsRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  let rows;
  try {
    rows = await listImportRows(db);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: ListImportsResponse = {
    count: rows.length,
    imports: rows.map(importToApi),
  };
  return c.json(response, 200);
};
