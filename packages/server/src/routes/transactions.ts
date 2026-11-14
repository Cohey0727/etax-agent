/**
 * transactions.ts — 取引ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createTransactionHandler,
  createTransactionRoute,
} from "../usecases/createTransaction";
import {
  deleteTransactionHandler,
  deleteTransactionRoute,
} from "../usecases/deleteTransaction";
import { listTransactionsHandler, listTransactionsRoute } from "../usecases/listTransactions";
import {
  updateTransactionHandler,
  updateTransactionRoute,
} from "../usecases/updateTransaction";

const app = new OpenAPIHono();
app.openapi(listTransactionsRoute, listTransactionsHandler);
app.openapi(createTransactionRoute, createTransactionHandler);
app.openapi(updateTransactionRoute, updateTransactionHandler);
app.openapi(deleteTransactionRoute, deleteTransactionHandler);

export default app;
