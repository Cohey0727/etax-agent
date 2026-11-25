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
import {
  fetchInvoiceResponse,
  getInvoiceRow,
} from "../repositories/invoiceRepository";
import { ErrorSchema } from "../schemas/common";
import { InvoiceIdParamSchema } from "../schemas/invoice";
import { buildInvoicePdf } from "../services/pdf/buildInvoicePdf";
import { loadJapaneseFont } from "../services/pdf/loadJapaneseFont";

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
  let invoice;
  try {
    const row = Number.isInteger(id) ? await getInvoiceRow(db, id) : null;
    if (!row) throw new HTTPException(404, { message: "請求書が見つかりません" });
    if (row.status !== "issued") {
      throw new HTTPException(400, {
        message: "PDFは発行済みの請求書だけダウンロードできます（先に発行してください）",
      });
    }
    invoice = await fetchInvoiceResponse(db, row);
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const fontBytes = await loadJapaneseFont();
  if (!fontBytes) {
    throw new HTTPException(503, {
      message:
        "PDF用の日本語フォントがサーバーに配置されていません。データフォルダの fonts/ に日本語フォント（ipaexg.ttf 等）を置いてください。",
    });
  }
  const pdf = await buildInvoicePdf(invoice, fontBytes);
  const body = new Uint8Array(pdf.byteLength);
  body.set(pdf);
  return c.body(body, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="invoice-${invoice.document_number ?? id}.pdf"`,
  });
};
