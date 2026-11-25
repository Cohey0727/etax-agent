/**
 * exportDomicilePdf.ts — 納税地の異動申出書（印刷用 PDF）出力ユースケース（usecases）。
 *
 * 納税者プロフィール（異動前・異動後の納税地を含む）から、国税庁の公式様式へ
 * 値を重ねた印刷用 PDF を生成する。e-Tax が使えない場合の紙提出用で、生成物
 * そのものが提出書類になる（提出日はリクエストの提出日を入れる）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { ErrorSchema } from "../schemas/common";
import {
  ExportDomicilePdfResponse,
  ExportDomicilePdfResponseSchema,
  ExportDomicilePdfRequestSchema,
} from "../schemas/etax";
import {
  buildDomicilePdfExport,
  FormPdfExport,
  PdfFormError,
} from "../services/pdf/formPdfExports";

export const exportDomicilePdfRoute = createRoute({
  method: "post",
  path: "/api/etax/export-domicile-pdf",
  operationId: "exportDomicilePdf",
  tags: ["Etax"],
  summary: "納税地の異動申出書（印刷用 PDF）の出力（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExportDomicilePdfRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExportDomicilePdfResponseSchema } },
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

export const exportDomicilePdfHandler: RouteHandler<typeof exportDomicilePdfRoute> = async (c) => {
  const body = c.req.valid("json");
  let result: FormPdfExport;
  try {
    result = await buildDomicilePdfExport(body.taxpayer, body.submission_date);
  } catch (e) {
    if (e instanceof PdfFormError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
  const response: ExportDomicilePdfResponse = result;
  return c.json(response, 200);
};
