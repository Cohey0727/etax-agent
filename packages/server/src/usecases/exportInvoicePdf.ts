/**
 * exportInvoicePdf.ts — 請求書 PDF のダウンロードユースケース（usecases）。DB必須。
 *
 * 発行済みの帳票だけを PDF 化する（発行者スナップショットと採番が凍結されて
 * いるため、再ダウンロードでも発行時と同じ帳票が再現される）。
 * 日本語フォントがサーバーに配置されていない場合は 503 で配置方法を案内する。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { ErrorSchema } from "../schemas/common";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import { getInvoicePdf } from "../services/invoice/invoiceDocuments";

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
  const db = requireDb();
  const { id } = c.req.valid("param");
  let result: { filename: string; pdf: Uint8Array };
  result = await getInvoicePdf(db, id);
  const body = new Uint8Array(result.pdf.byteLength);
  body.set(result.pdf);
  return c.body(body, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${result.filename}"`,
  });
};
