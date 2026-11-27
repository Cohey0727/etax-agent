/**
 * listFilingStatuses.ts — 申告ステータス一覧ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import {
  filingStatusToApi,
  listFilingStatusRows,
} from "../repositories/filingStatusRepository";
import { ErrorSchema } from "../schemas/common";
import {
  ListFilingStatusesResponse,
  ListFilingStatusesResponseSchema,
} from "../schemas/filingStatus";

export const listFilingStatusesRoute = createRoute({
  method: "get",
  path: "/api/filing-status",
  operationId: "listFilingStatuses",
  tags: ["FilingStatus"],
  summary: "申告ステータス一覧を取得（DB必須）",
  responses: {
    200: {
      content: { "application/json": { schema: ListFilingStatusesResponseSchema } },
      description: "申告ステータス一覧",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listFilingStatusesHandler: RouteHandler<typeof listFilingStatusesRoute> = async (
  c,
) => {
  const db = requireDb();
  const rows = await listFilingStatusRows(db);
  const response: ListFilingStatusesResponse = { statuses: rows.map(filingStatusToApi) };
  return c.json(response, 200);
};
