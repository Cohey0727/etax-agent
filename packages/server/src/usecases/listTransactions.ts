/**
 * listTransactions.ts — 取引一覧ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  listTransactionRows,
  transactionToApi,
} from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  ListTransactionsQuerySchema,
  ListTransactionsResponse,
  ListTransactionsResponseSchema,
} from "../schemas/transaction";

export const listTransactionsRoute = createRoute({
  method: "get",
  path: "/api/transactions",
  operationId: "listTransactions",
  tags: ["Transactions"],
  summary: "取引一覧を取得（DB必須）",
  request: { query: ListTransactionsQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: ListTransactionsResponseSchema } },
      description: "取引一覧",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listTransactionsHandler: RouteHandler<typeof listTransactionsRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const { year, income_type: incomeType } = c.req.valid("query");
  let rows;
  try {
    // 対象年の絞り込みは割り当て年度で、SQL 側で行う（日付の年とは限らない）
    rows = await listTransactionRows(db, incomeType, year);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: ListTransactionsResponse = {
    count: rows.length,
    transactions: rows.map(transactionToApi),
  };
  return c.json(response, 200);
};
