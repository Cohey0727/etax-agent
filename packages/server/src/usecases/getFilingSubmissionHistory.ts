/**
 * getFilingSubmissionHistory.ts — 対象年の提出の記録の変更履歴を取得する
 * （usecases）。DB必須。Issue #20 Phase 0（JIIMA 自己点検対応）。
 *
 * 電子帳簿保存法の訂正・削除履歴を画面から参照するための読み取り専用
 * エンドポイント。履歴は新しい順に返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  filingSubmissionHistoryToApi,
  listFilingSubmissionHistoryRows,
} from "../repositories/filingSubmissionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  FilingSubmissionYearParamSchema,
  ListFilingSubmissionHistoryResponse,
  ListFilingSubmissionHistoryResponseSchema,
} from "../schemas/filingSubmission";

export const getFilingSubmissionHistoryRoute = createRoute({
  method: "get",
  path: "/api/filing-submissions/{year}/history",
  operationId: "getFilingSubmissionHistory",
  tags: ["FilingSubmissions"],
  summary: "対象年の提出の記録の変更履歴を取得（DB必須）",
  request: { params: FilingSubmissionYearParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ListFilingSubmissionHistoryResponseSchema } },
      description: "対象年の提出の記録の変更履歴（新しい順）",
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

export const getFilingSubmissionHistoryHandler: RouteHandler<
  typeof getFilingSubmissionHistoryRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const year = Number(c.req.valid("param").year);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new HTTPException(400, { message: "year が不正です" });
  }
  let rows;
  try {
    rows = await listFilingSubmissionHistoryRows(db, year);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: ListFilingSubmissionHistoryResponse = {
    count: rows.length,
    history: rows.map(filingSubmissionHistoryToApi),
  };
  return c.json(response, 200);
};
