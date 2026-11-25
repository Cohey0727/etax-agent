/**
 * exportInvoicePdf.ts — 請求書 PDF のダウンロードユースケース（usecases）。DB必須。
 *
 * 発行済みの帳票だけを PDF 化する（発行者スナップショットと採番が凍結されて
 * いるため、再ダウンロードでも発行時と同じ帳票が再現される）。
 * 日本語フォントがサーバーに配置されていない場合は 503 で配置方法を案内する。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "@hono/zod-openapi";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import { getInvoicePdf, InvoiceDocumentError } from "../services/invoice/invoiceDocuments";

export const exportInvoicePdfRoute = createRoute({
  method: "get",
  path: "/api/invoices/{id}/pdf",
  operationId: "exportInvoicePdf",
  tags: ["Invoices"],
  summary: "請求書PDFをダウンロード（DB必須）",
  request: { params: InvoiceIdParamSchema },
  responses: {
    200: {
      content: { "application/pdf": { schema: z.string() } },
      description: "請求書PDF",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "下書きでPDF化できない",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "請求書が存在しない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定・接続不可、または日本語フォント未配置",
    },
  },
});

export const exportInvoicePdfHandler: RouteHandler<typeof exportInvoicePdfRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.valid("param").id);
  if (!Number.isInteger(id)) throw new HTTPException(404, { message: "請求書が見つかりません" });
  let result: { filename: string; pdf: Uint8Array };
  try {
    result = await getInvoicePdf(db, id);
  } catch (e) {
    if (e instanceof InvoiceDocumentError) {
      throw new HTTPException(e.status, { message: e.message });
    }
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const body = new Uint8Array(result.pdf.byteLength);
  body.set(result.pdf);
  return c.body(body, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${result.filename}"`,
  });
};
