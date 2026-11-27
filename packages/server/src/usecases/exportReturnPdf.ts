/**
 * exportReturnPdf.ts — 申告書の紙イメージ PDF 出力ユースケース（usecases）。
 *
 * 入力は XTX 出力と同じ。計算と描画は services/pdf の buildReturnPdfExport が
 * 担う（MCP の export_return_pdf と共通）。生成物は確認用のイメージで、
 * 提出データは XTX 出力を使う（案内はクライアント側の文言で示す）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import {
  ExportReturnPdfResponse,
  ExportReturnPdfResponseSchema,
  ExportXtxRequestSchema,
} from "../schemas/etax";
import { ErrorSchema } from "../schemas/common";
import { incomeTaxReturnFromWire } from "../services/etax/xtxInputs";
import { buildReturnPdfExport } from "../services/pdf/formPdfExports";

export const exportReturnPdfRoute = createRoute({
  method: "post",
  path: "/api/etax/export-return-pdf",
  operationId: "exportReturnPdf",
  tags: ["Etax"],
  summary: "申告書の紙イメージ PDF の出力（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExportXtxRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExportReturnPdfResponseSchema } },
      description: "PDFファイル名と Base64 本体",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "リクエストが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "様式 PDF または日本語フォントを用意できない",
    },
  },
});

export const exportReturnPdfHandler: RouteHandler<typeof exportReturnPdfRoute> = async (c) => {
  const body = c.req.valid("json");
  const response: ExportReturnPdfResponse = await buildReturnPdfExport(incomeTaxReturnFromWire(body));
  return c.json(response, 200);
};
