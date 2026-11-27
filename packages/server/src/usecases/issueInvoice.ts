/**
 * issueInvoice.ts — 請求書の発行ユースケース（usecases）。DB必須。
 *
 * 発行 = 採番＋発行者情報のスナップショット凍結＋不変化。
 * 適格請求書として発行する場合は、消費税法57条の4第1項の記載事項が
 * 欠けていないことを発行前に検証する（登録番号はプロフィールの値を
 * そのまま使い、自動生成・補完はしない）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import {
  InvoiceIdParamSchema,
  SingleInvoiceResponse,
  SingleInvoiceResponseSchema,
} from "../schemas/invoice";
import { issueInvoiceDocument } from "../services/invoice/invoiceDocuments";

export const issueInvoiceRoute = createRoute({
  method: "post",
  path: "/api/invoices/{id}/issue",
  operationId: "issueInvoice",
  tags: ["Invoices"],
  summary: "請求書を発行（採番・不変化）（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleInvoiceResponseSchema } },
      description: "発行された請求書",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "記載事項の不足、または発行済み",
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

export const issueInvoiceHandler: RouteHandler<typeof issueInvoiceRoute> = async (c) => {
  const db = requireDb();
  const { id } = c.req.valid("param");
  const response: SingleInvoiceResponse = { invoice: await issueInvoiceDocument(db, id) };
  return c.json(response, 200);
};
