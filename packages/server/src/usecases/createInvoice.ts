/**
 * createInvoice.ts — 請求書（下書き）の作成ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import {
  fetchInvoiceResponse,
  insertInvoice,
} from "../repositories/invoiceRepository";
import { ErrorSchema } from "../schemas/common";
import {
  CreateInvoiceRequestSchema,
  SingleInvoiceResponse,
  SingleInvoiceResponseSchema,
} from "../schemas/invoice";
import { toInvoiceDrafts } from "../services/invoice/invoiceDraft";

export const createInvoiceRoute = createRoute({
  method: "post",
  path: "/api/invoices",
  operationId: "createInvoice",
  tags: ["Invoices"],
  summary: "請求書（下書き）を作成（DB必須）",
  responses: {
    201: {
      content: { "application/json": { schema: SingleInvoiceResponseSchema } },
      description: "作成された請求書",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const createInvoiceHandler: RouteHandler<typeof createInvoiceRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = CreateInvoiceRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "請求書の入力が不正です" });
  }
  const { header, lines } = toInvoiceDrafts(parsed.data);
  let response: SingleInvoiceResponse;
  try {
    const row = await insertInvoice(db, header, lines, null);
    response = { invoice: row ? await fetchInvoiceResponse(db, row) : null };
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 201);
};
