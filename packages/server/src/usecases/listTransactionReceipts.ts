/**
 * listTransactionReceipts.ts — 取引に紐付いた証憑の一覧（usecases）。DB必須。
 * 帳簿側から証憑を辿るための口。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { listReceiptRowsForTransaction, receiptToApi } from "../repositories/receiptRepository";
import { ErrorSchema } from "../schemas/common";
import { ReceiptListResponse, ReceiptListResponseSchema } from "../schemas/receipt";
import { TransactionIdParamSchema } from "../schemas/transaction";

export const listTransactionReceiptsRoute = createRoute({
  method: "get",
  path: "/api/transactions/{id}/receipts",
  operationId: "listTransactionReceipts",
  tags: ["Receipts"],
  summary: "取引に紐付いた証憑の一覧（DB必須）",
  request: { params: TransactionIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ReceiptListResponseSchema } },
      description: "証憑の一覧",
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

export const listTransactionReceiptsHandler: RouteHandler<
  typeof listTransactionReceiptsRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const { id } = c.req.valid("param");
  let rows;
  try {
    rows = await listReceiptRowsForTransaction(db, id);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: ReceiptListResponse = { receipts: rows.map(receiptToApi) };
  return c.json(response, 200);
};
