/**
 * getTransactionHistory.ts — 取引の変更履歴取得ユースケース（usecases）。DB必須。
 *
 * 電子帳簿保存法の訂正・削除履歴を帳簿側から参照するための読み取り専用
 * エンドポイント。履歴は新しい順に返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  listTransactionHistoryRows,
  transactionHistoryToApi,
} from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  ListTransactionHistoryResponse,
  ListTransactionHistoryResponseSchema,
  TransactionIdParamSchema,
} from "../schemas/transaction";

export const getTransactionHistoryRoute = createRoute({
  method: "get",
  path: "/api/transactions/{id}/history",
  operationId: "getTransactionHistory",
  tags: ["Transactions"],
  summary: "取引の変更履歴を取得（DB必須）",
  request: { params: TransactionIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ListTransactionHistoryResponseSchema } },
      description: "取引の変更履歴（新しい順）",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "id が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const getTransactionHistoryHandler: RouteHandler<
  typeof getTransactionHistoryRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "id が不正です" });
  let rows;
  try {
    rows = await listTransactionHistoryRows(db, id);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: ListTransactionHistoryResponse = {
    count: rows.length,
    history: rows.map(transactionHistoryToApi),
  };
  return c.json(response, 200);
};
