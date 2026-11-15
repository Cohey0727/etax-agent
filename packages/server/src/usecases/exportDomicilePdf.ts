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
import { buildDomicilePdf } from "../services/pdf/buildDomicilePdf";
import { buildDomicileFormValues } from "../services/pdf/domicileFormValues";
import { loadDomicileFormTemplate } from "../services/pdf/loadDomicileFormTemplate";
import { loadJapaneseFont } from "../services/pdf/loadJapaneseFont";

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
  const [template, font] = await Promise.all([loadDomicileFormTemplate(), loadJapaneseFont()]);
  if (!template) {
    throw new HTTPException(503, {
      message:
        "異動申出書の様式 PDF を用意できませんでした。サーバーのデータフォルダ forms へ公式様式を配置するか、ネットワーク接続を確認してください。",
    });
  }
  if (!font) {
    throw new HTTPException(503, {
      message:
        "日本語フォントがサーバーに配置されていないため、印刷用 PDF を生成できません。データフォルダの fonts へ IPAex ゴシック等を配置してください。",
    });
  }
  const values = buildDomicileFormValues(body.taxpayer, body.submission_date);
  let pdf: Uint8Array;
  try {
    pdf = await buildDomicilePdf(values, template, font);
  } catch (e) {
    throw new HTTPException(400, {
      message: e instanceof Error ? e.message : "印刷用 PDF の生成に失敗しました",
    });
  }
  const response: ExportDomicilePdfResponse = {
    filename: "nozeichi-idou-moshidesho.pdf",
    pdf_base64: Buffer.from(pdf).toString("base64"),
  };
  return c.json(response, 200);
};
