/**
 * listTransactionHistory.ts — 全取引の変更履歴一覧ユースケース（usecases）。
 * DB必須。
 *
 * 帳簿画面の訂正・削除履歴ビューア用。削除済みの取引は帳簿一覧から
 * 消えるため、その履歴はこの一覧経由でしか辿れない。履歴は新しい順。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  listRecentTransactionHistoryRows,
  transactionHistoryToApi,
} from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  ListRecentTransactionHistoryQuerySchema,
  ListTransactionHistoryResponse,
  ListTransactionHistoryResponseSchema,
} from "../schemas/transaction";

/** 履歴一覧の既定件数と上限。 */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export const listTransactionHistoryRoute = createRoute({
  method: "get",
  path: "/api/transactions/history",
  operationId: "listTransactionHistory",
  tags: ["Transactions"],
  summary: "全取引の変更履歴を新しい順に取得（DB必須）",
  request: { query: ListRecentTransactionHistoryQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: ListTransactionHistoryResponseSchema } },
      description: "全取引の変更履歴（新しい順）",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listTransactionHistoryHandler: RouteHandler<
  typeof listTransactionHistoryRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const requested = c.req.valid("query").limit;
  const limit = requested === undefined ? DEFAULT_LIMIT : Math.min(requested, MAX_LIMIT);
  let rows;
  try {
    rows = await listRecentTransactionHistoryRows(db, limit);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: ListTransactionHistoryResponse = {
    count: rows.length,
    history: rows.map(transactionHistoryToApi),
  };
  return c.json(response, 200);
};
