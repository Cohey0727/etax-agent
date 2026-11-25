/**
 * deleteInvoicePayment.ts — 入金消込の解除ユースケース（usecases）。DB必須。
 *
 * 解除すると、その消込で自動生成した差額調整・預り金の取引も論理削除する
 * （リポジトリ側）。入金取引そのものは残る。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { getInvoiceRow } from "../repositories/invoiceRepository";
import {
  deleteReconciliation,
  fetchPaymentsResponse,
} from "../repositories/reconciliationRepository";
import { ErrorSchema } from "../schemas/common";
import {
  InvoicePaymentIdParamSchema,
  InvoicePaymentsResponse,
  InvoicePaymentsResponseSchema,
} from "../schemas/reconciliation";

export const deleteInvoicePaymentRoute = createRoute({
  method: "delete",
  path: "/api/invoices/{id}/payments/{paymentId}",
  operationId: "deleteInvoicePayment",
  tags: ["Invoices"],
  summary: "請求書の入金消込を解除（DB必須）",
  request: { params: InvoicePaymentIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: InvoicePaymentsResponseSchema } },
      description: "解除後の一覧とサマリ",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "請求書または消込が存在しない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const deleteInvoicePaymentHandler: RouteHandler<typeof deleteInvoicePaymentRoute> = async (
  c,
) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const params = c.req.valid("param");
  const id = Number(params.id);
  const paymentId = Number(params.paymentId);
  let response: InvoicePaymentsResponse;
  try {
    const invoice = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!invoice) throw new HTTPException(404, { message: "請求書が見つかりません" });
    const deleted =
      Number.isInteger(paymentId) && (await deleteReconciliation(db, id, paymentId));
    if (!deleted) throw new HTTPException(404, { message: "消込が見つかりません" });
    response = await fetchPaymentsResponse(db, invoice);
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
