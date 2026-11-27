/**
 * createInvoiceCorrection.ts — 「修正した適格請求書」の下書き作成ユースケース（usecases）。DB必須。
 *
 * 発行済み帳票は不変のため、内容の修正は元帳票をコピーした新しい下書きを
 * 作り、修正元への参照（corrects_document_id）を付けて発行し直す形で行う
 * （消費税法57条の4第4項：修正は発行側が修正した適格請求書を交付する）。
 * 発行日は当日で初期化する（取引年月日は修正書類自身の交付日）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import {
  InvoiceIdParamSchema,
  SingleInvoiceResponse,
  SingleInvoiceResponseSchema,
} from "../schemas/invoice";
import {
  createInvoiceCorrectionDraft,
  InvoiceDocumentError,
} from "../services/invoice/invoiceDocuments";

export const createInvoiceCorrectionRoute = createRoute({
  method: "post",
  path: "/api/invoices/{id}/correct",
  operationId: "createInvoiceCorrection",
  tags: ["Invoices"],
  summary: "発行済み請求書の修正用下書きを作成（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    201: {
      content: { "application/json": { schema: SingleInvoiceResponseSchema } },
      description: "作成された修正用下書き",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "発行済みでないため修正を作れない",
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

export const createInvoiceCorrectionHandler: RouteHandler<
  typeof createInvoiceCorrectionRoute
> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const { id } = c.req.valid("param");
  let response: SingleInvoiceResponse;
  try {
    response = { invoice: await createInvoiceCorrectionDraft(db, id) };
  } catch (e) {
    if (e instanceof InvoiceDocumentError) {
      throw new HTTPException(e.status, { message: e.message });
    }
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 201);
};
