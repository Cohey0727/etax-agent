/**
 * exportBlueReturnPdf.ts — 所得税の青色申告承認申請書（印刷用 PDF）出力ユースケース（usecases）。
 *
 * 納税者プロフィールと開業の専用入力から、国税庁の公式様式（様式ID
 * NTA1KOZ210010021）へ値を重ねた印刷用 PDF を生成する。提出そのものは
 * e-Tax 等で本人が行い、この PDF は紙提出用と記入内容の確認用。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { ErrorSchema } from "../schemas/common";
import {
  ExportBusinessStartPdfRequestSchema,
  ExportBusinessStartPdfResponse,
  ExportBusinessStartPdfResponseSchema,
} from "../schemas/businessStart";
import {
  buildBlueReturnPdfExport,
  FormPdfExport,
  PdfFormError,
} from "../services/pdf/formPdfExports";

export const exportBlueReturnPdfRoute = createRoute({
  method: "post",
  path: "/api/etax/export-blue-return-pdf",
  operationId: "exportBlueReturnPdf",
  tags: ["Etax"],
  summary: "所得税の青色申告承認申請書（印刷用 PDF）の出力（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExportBusinessStartPdfRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExportBusinessStartPdfResponseSchema } },
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

export const exportBlueReturnPdfHandler: RouteHandler<
  typeof exportBlueReturnPdfRoute
> = async (c) => {
  const body = c.req.valid("json");
  let result: FormPdfExport;
  try {
    result = await buildBlueReturnPdfExport(body.taxpayer, body.inputs, body.submission_date);
  } catch (e) {
    if (e instanceof PdfFormError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
  const response: ExportBusinessStartPdfResponse = result;
  return c.json(response, 200);
};
