/**
 * exportOpeningNoticePdf.ts — 個人事業の開業・廃業等届出書（印刷用 PDF）出力ユースケース（usecases）。
 *
 * 納税者プロフィールと開業の専用入力から、国税庁の公式様式（様式ID
 * NTA1KOZ060010040）へ値を重ねた印刷用 PDF を生成する。対象は「開業」の
 * 届出。提出そのものは e-Tax 等で本人が行い、この PDF は紙提出用と
 * 記入内容の確認用。
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
  buildOpeningNoticePdfExport,
  FormPdfExport,
  PdfFormError,
} from "../services/pdf/formPdfExports";

export const exportOpeningNoticePdfRoute = createRoute({
  method: "post",
  path: "/api/etax/export-opening-notice-pdf",
  operationId: "exportOpeningNoticePdf",
  tags: ["Etax"],
  summary: "個人事業の開業・廃業等届出書（印刷用 PDF）の出力（DB不要）",
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

export const exportOpeningNoticePdfHandler: RouteHandler<
  typeof exportOpeningNoticePdfRoute
> = async (c) => {
  const body = c.req.valid("json");
  let result: FormPdfExport;
  try {
    result = await buildOpeningNoticePdfExport(body.taxpayer, body.inputs, body.submission_date);
  } catch (e) {
    if (e instanceof PdfFormError) throw new HTTPException(e.status, { message: e.message });
    throw e;
  }
  const response: ExportBusinessStartPdfResponse = result;
  return c.json(response, 200);
};
