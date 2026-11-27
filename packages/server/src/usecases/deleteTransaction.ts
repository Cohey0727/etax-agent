/**
 * deleteTransaction.ts — 取引削除ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { deleteTransactionRow, transactionToApi } from "../repositories/transactionRepository";
import { ErrorSchema } from "../schemas/common";
import {
  DeleteTransactionResponse,
  DeleteTransactionResponseSchema,
  TransactionIdParamSchema,
} from "../schemas/transaction";

export const deleteTransactionRoute = createRoute({
  method: "delete",
  path: "/api/transactions/{id}",
  operationId: "deleteTransaction",
  tags: ["Transactions"],
  summary: "取引を削除（DB必須）",
  request: { params: TransactionIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: DeleteTransactionResponseSchema } },
      description: "削除された取引",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "id が不正",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の取引が無い",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const deleteTransactionHandler: RouteHandler<typeof deleteTransactionRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const { id } = c.req.valid("param");
  let row;
  try {
    row = await deleteTransactionRow(db, id);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  if (!row) throw new HTTPException(404, { message: "対象の取引が見つかりません" });
  const response: DeleteTransactionResponse = { deleted: transactionToApi(row) };
  return c.json(response, 200);
};
