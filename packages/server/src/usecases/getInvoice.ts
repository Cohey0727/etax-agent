/**
 * getInvoice.ts — 請求書1件の取得ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  fetchInvoiceResponse,
  getInvoiceRow,
} from "../repositories/invoiceRepository";
import { ErrorSchema } from "../schemas/common";
import {
  InvoiceIdParamSchema,
  SingleInvoiceResponse,
  SingleInvoiceResponseSchema,
} from "../schemas/invoice";

export const getInvoiceRoute = createRoute({
  method: "get",
  path: "/api/invoices/{id}",
  operationId: "getInvoice",
  tags: ["Invoices"],
  summary: "請求書を1件取得（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleInvoiceResponseSchema } },
      description: "請求書",
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

export const getInvoiceHandler: RouteHandler<typeof getInvoiceRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  let response: SingleInvoiceResponse;
  try {
    const row = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!row) throw new HTTPException(404, { message: "請求書が見つかりません" });
    response = { invoice: await fetchInvoiceResponse(db, row) };
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
