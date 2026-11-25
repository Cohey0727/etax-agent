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
import { buildBlueReturnPdf } from "../services/pdf/buildBlueReturnPdf";
import { buildBlueReturnFormValues } from "../services/pdf/businessStartFormValues";
import { loadBlueReturnFormTemplate } from "../services/pdf/loadBlueReturnFormTemplate";
import { loadJapaneseFont } from "../services/pdf/loadJapaneseFont";

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
  const [template, font] = await Promise.all([
    loadBlueReturnFormTemplate(),
    loadJapaneseFont(),
  ]);
  if (!template) {
    throw new HTTPException(503, {
      message:
        "青色申告承認申請書の様式 PDF を用意できませんでした。サーバーのデータフォルダ forms へ公式様式を配置するか、ネットワーク接続を確認してください。",
    });
  }
  if (!font) {
    throw new HTTPException(503, {
      message:
        "日本語フォントがサーバーに配置されていないため、印刷用 PDF を生成できません。データフォルダの fonts へ IPAex ゴシック等を配置してください。",
    });
  }
  const values = buildBlueReturnFormValues(body.taxpayer, body.inputs, body.submission_date);
  let pdf: Uint8Array;
  try {
    pdf = await buildBlueReturnPdf(values, template, font);
  } catch (e) {
    throw new HTTPException(400, {
      message: e instanceof Error ? e.message : "印刷用 PDF の生成に失敗しました",
    });
  }
  const response: ExportBusinessStartPdfResponse = {
    filename: "aoiro-shinkoku-shinsei.pdf",
    pdf_base64: Buffer.from(pdf).toString("base64"),
  };
  return c.json(response, 200);
};
