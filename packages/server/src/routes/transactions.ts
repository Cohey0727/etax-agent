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
import {
  exportLedgerPdfHandler,
  exportLedgerPdfRoute,
} from "../usecases/exportLedgerPdf";
import {
  getTransactionHistoryHandler,
  getTransactionHistoryRoute,
} from "../usecases/getTransactionHistory";
import { listTransactionsHandler, listTransactionsRoute } from "../usecases/listTransactions";
import {
  replaceYearTransactionsHandler,
  replaceYearTransactionsRoute,
} from "../usecases/replaceYearTransactions";
import {
  updateTransactionHandler,
  updateTransactionRoute,
} from "../usecases/updateTransaction";

const app = new OpenAPIHono();
app.openapi(listTransactionsRoute, listTransactionsHandler);
app.openapi(exportLedgerPdfRoute, exportLedgerPdfHandler);
app.openapi(createTransactionRoute, createTransactionHandler);
app.openapi(replaceYearTransactionsRoute, replaceYearTransactionsHandler);
app.openapi(updateTransactionRoute, updateTransactionHandler);
app.openapi(deleteTransactionRoute, deleteTransactionHandler);
app.openapi(getTransactionHistoryRoute, getTransactionHistoryHandler);

export default app;
