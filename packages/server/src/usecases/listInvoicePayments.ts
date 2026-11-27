/**
 * listInvoicePayments.ts — 請求書の消込一覧ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
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
  const db = requireDb();
  const { id } = c.req.valid("param");
  const row = await getInvoiceRow(db, id);
  if (!row) throw new HTTPException(404, { message: "請求書が見つかりません" });
  const response: InvoicePaymentsResponse = await fetchPaymentsResponse(db, row);
  return c.json(response, 200);
};
