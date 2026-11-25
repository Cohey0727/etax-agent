/**
 * deleteInvoice.ts — 請求書（下書き）の削除ユースケース（usecases）。DB必須。
 *
 * 発行済みの帳票は写しの保存義務（7年）があるため削除できない。
 * 削除できるのは下書きだけ。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import { MessageResponseSchema } from "../schemas/fixedAsset";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import {
  deleteInvoiceDocument,
  InvoiceDocumentError,
} from "../services/invoice/invoiceDocuments";

export const deleteInvoiceRoute = createRoute({
  method: "delete",
  path: "/api/invoices/{id}",
  operationId: "deleteInvoice",
  tags: ["Invoices"],
  summary: "請求書（下書き）を削除（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: MessageResponseSchema } },
      description: "削除完了",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "発行済みで削除できない",
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

export const deleteInvoiceHandler: RouteHandler<typeof deleteInvoiceRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  if (!Number.isInteger(id)) throw new HTTPException(404, { message: "請求書が見つかりません" });
  try {
    await deleteInvoiceDocument(db, id);
  } catch (e) {
    if (e instanceof InvoiceDocumentError) {
      throw new HTTPException(e.status, { message: e.message });
    }
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json({ message: "削除しました" }, 200);
};
