/**
 * listInvoices.ts — 請求書の一覧・発行控え検索ユースケース（usecases）。DB必須。
 *
 * 検索条件は電子帳簿保存法の検索要件（取引年月日・金額・取引先）に合わせる。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  fetchInvoiceResponse,
  InvoiceListFilters,
  listInvoiceRows,
} from "../repositories/invoiceRepository";
import { ErrorSchema } from "../schemas/common";
import {
  InvoiceListResponse,
  InvoiceListResponseSchema,
  ListInvoicesQuerySchema,
} from "../schemas/invoice";

export const listInvoicesRoute = createRoute({
  method: "get",
  path: "/api/invoices",
  operationId: "listInvoices",
  tags: ["Invoices"],
  summary: "請求書の一覧・検索（DB必須）",
  request: { query: ListInvoicesQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: InvoiceListResponseSchema } },
      description: "請求書の一覧",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listInvoicesHandler: RouteHandler<typeof listInvoicesRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const query = c.req.valid("query");
  const filters: InvoiceListFilters = {
    q: query.q,
    from: query.from,
    to: query.to,
    minTotal: query.min_total,
    maxTotal: query.max_total,
    status: query.status,
  };
  let response: InvoiceListResponse;
  try {
    const rows = await listInvoiceRows(db, filters);
    response = { invoices: await Promise.all(rows.map((row) => fetchInvoiceResponse(db, row))) };
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
