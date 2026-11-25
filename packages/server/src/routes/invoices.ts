/**
 * invoices.ts — 請求書ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { createInvoiceHandler, createInvoiceRoute } from "../usecases/createInvoice";
import {
  createInvoiceCorrectionHandler,
  createInvoiceCorrectionRoute,
} from "../usecases/createInvoiceCorrection";
import {
  createInvoicePaymentHandler,
  createInvoicePaymentRoute,
} from "../usecases/createInvoicePayment";
import { deleteInvoiceHandler, deleteInvoiceRoute } from "../usecases/deleteInvoice";
import {
  deleteInvoicePaymentHandler,
  deleteInvoicePaymentRoute,
} from "../usecases/deleteInvoicePayment";
import { exportInvoicePdfHandler, exportInvoicePdfRoute } from "../usecases/exportInvoicePdf";
import { getInvoiceHandler, getInvoiceRoute } from "../usecases/getInvoice";
import { issueInvoiceHandler, issueInvoiceRoute } from "../usecases/issueInvoice";
import { listInvoicesHandler, listInvoicesRoute } from "../usecases/listInvoices";
import {
  listInvoicePaymentsHandler,
  listInvoicePaymentsRoute,
} from "../usecases/listInvoicePayments";
import {
  listPaymentSuggestionsHandler,
  listPaymentSuggestionsRoute,
} from "../usecases/listPaymentSuggestions";
import { updateInvoiceHandler, updateInvoiceRoute } from "../usecases/updateInvoice";

const app = new OpenAPIHono();
app.openapi(listInvoicesRoute, listInvoicesHandler);
app.openapi(createInvoiceRoute, createInvoiceHandler);
app.openapi(getInvoiceRoute, getInvoiceHandler);
app.openapi(updateInvoiceRoute, updateInvoiceHandler);
app.openapi(deleteInvoiceRoute, deleteInvoiceHandler);
app.openapi(issueInvoiceRoute, issueInvoiceHandler);
app.openapi(createInvoiceCorrectionRoute, createInvoiceCorrectionHandler);
app.openapi(exportInvoicePdfRoute, exportInvoicePdfHandler);
app.openapi(listInvoicePaymentsRoute, listInvoicePaymentsHandler);
app.openapi(createInvoicePaymentRoute, createInvoicePaymentHandler);
app.openapi(deleteInvoicePaymentRoute, deleteInvoicePaymentHandler);
app.openapi(listPaymentSuggestionsRoute, listPaymentSuggestionsHandler);

export default app;
