/**
 * updateInvoice.ts — 請求書（下書き）の更新ユースケース（usecases）。DB必須。
 *
 * 発行済みの帳票は不変のため、発行済みへの更新は 400 で拒む。
 * 内容の誤りは「修正した適格請求書」を新規発行して直す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import {
  fetchInvoiceResponse,
  getInvoiceRow,
  updateInvoice,
} from "../repositories/invoiceRepository";
import { ErrorSchema } from "../schemas/common";
import {
  InvoiceIdParamSchema,
  SingleInvoiceResponse,
  SingleInvoiceResponseSchema,
  UpdateInvoiceRequestSchema,
} from "../schemas/invoice";
import { toInvoiceDrafts } from "../services/invoice/invoiceDraft";

export const updateInvoiceRoute = createRoute({
  method: "put",
  path: "/api/invoices/{id}",
  operationId: "updateInvoice",
  tags: ["Invoices"],
  summary: "請求書（下書き）を更新（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleInvoiceResponseSchema } },
      description: "更新された請求書",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディが不正、または発行済みで変更できない",
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

export const updateInvoiceHandler: RouteHandler<typeof updateInvoiceRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = UpdateInvoiceRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "請求書の入力が不正です" });
  }
  const { header, lines } = toInvoiceDrafts(parsed.data);
  let response: SingleInvoiceResponse;
  try {
    const existing = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!existing) throw new HTTPException(404, { message: "請求書が見つかりません" });
    if (existing.status === "issued") {
      throw new HTTPException(400, {
        message: "発行済みの請求書は変更できません。修正は「修正した適格請求書」の新規発行で行ってください",
      });
    }
    const row = await updateInvoice(db, id, header, lines);
    if (!row) throw new HTTPException(404, { message: "請求書が見つかりません" });
    response = { invoice: await fetchInvoiceResponse(db, row) };
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
