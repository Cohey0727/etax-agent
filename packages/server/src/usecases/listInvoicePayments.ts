/**
 * listInvoicePayments.ts — 請求書の消込一覧ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { getInvoiceRow } from "../repositories/invoiceRepository";
import { fetchPaymentsResponse } from "../repositories/reconciliationRepository";
import { ErrorSchema } from "../schemas/common";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import {
  InvoicePaymentsResponse,
  InvoicePaymentsResponseSchema,
} from "../schemas/reconciliation";

export const listInvoicePaymentsRoute = createRoute({
  method: "get",
  path: "/api/invoices/{id}/payments",
  operationId: "listInvoicePayments",
  tags: ["Invoices"],
  summary: "請求書の入金消込の一覧と残額（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: InvoicePaymentsResponseSchema } },
      description: "消込の一覧とサマリ",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "請求書が存在しない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listInvoicePaymentsHandler: RouteHandler<typeof listInvoicePaymentsRoute> = async (
  c,
) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  let response: InvoicePaymentsResponse;
  try {
    const row = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!row) throw new HTTPException(404, { message: "請求書が見つかりません" });
    response = await fetchPaymentsResponse(db, row);
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
