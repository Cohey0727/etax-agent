/**
 * getFilingSubmissions.ts — 対象年の提出の記録を取得する（usecases）。
 * DB必須。Issue #28 Phase 1。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import {
  filingSubmissionToApi,
  listFilingSubmissionRows,
} from "../repositories/filingSubmissionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  FilingSubmissionYearParamSchema,
  ListFilingSubmissionsResponse,
  ListFilingSubmissionsResponseSchema,
} from "../schemas/filingSubmission";

export const getFilingSubmissionsRoute = createRoute({
  method: "get",
  path: "/api/filing-submissions/{year}",
  operationId: "getFilingSubmissions",
  tags: ["FilingSubmissions"],
  summary: "対象年の提出の記録（受付番号・受信通知）を取得（DB必須）",
  request: { params: FilingSubmissionYearParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ListFilingSubmissionsResponseSchema } },
      description: "対象年の提出の記録",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const getFilingSubmissionsHandler: RouteHandler<
  typeof getFilingSubmissionsRoute
> = async (c) => {
  const db = requireDb();
  const { year } = c.req.valid("param");
  const rows = await listFilingSubmissionRows(db, year);
  const response: ListFilingSubmissionsResponse = {
    submissions: rows.map(filingSubmissionToApi),
  };
  return c.json(response, 200);
};
