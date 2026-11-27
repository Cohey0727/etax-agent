/**
 * updateInvoice.ts — 請求書（下書き）の更新ユースケース（usecases）。DB必須。
 *
 * 発行済みの帳票は不変のため、発行済みへの更新は 400 で拒む。
 * 内容の誤りは「修正した適格請求書」を新規発行して直す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { ErrorSchema } from "../schemas/common";
import {
  InvoiceIdParamSchema,
  SingleInvoiceResponse,
  SingleInvoiceResponseSchema,
  UpdateInvoiceRequestSchema,
} from "../schemas/invoice";
import { updateInvoiceDocument } from "../services/invoice/invoiceDocuments";

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
  const db = requireDb();
  const { id } = c.req.valid("param");
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = UpdateInvoiceRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "請求書の入力が不正です" });
  }
  const response: SingleInvoiceResponse = { invoice: await updateInvoiceDocument(db, id, parsed.data) };
  return c.json(response, 200);
};
