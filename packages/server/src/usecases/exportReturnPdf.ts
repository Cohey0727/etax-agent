/**
 * exportReturnPdf.ts — 申告書の紙イメージ PDF 出力ユースケース（usecases）。
 *
 * 入力は XTX 出力と同じ。計算は @etax/shared のエンジン、描画は
 * services/pdf の buildReturnPdf が担う。生成物は確認用のイメージで、
 * 提出データは XTX 出力を使う（案内はクライアント側の文言で示す）。
 */
import {
  computeCorrectedFigures,
  computeIncomeTax,
  filterYear,
  normalizeTransactions,
} from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  ExportReturnPdfResponse,
  ExportReturnPdfResponseSchema,
  ExportXtxRequestSchema,
} from "../schemas/etax";
import { ErrorSchema } from "../schemas/common";
import { buildReturnPdf } from "../services/pdf/buildReturnPdf";
import { loadJapaneseFont } from "../services/pdf/loadJapaneseFont";
import { loadReturnFormTemplate } from "../services/pdf/loadReturnFormTemplate";
import { buildReturnFormValues } from "../services/pdf/returnFormValues";
import { toTaxpayer } from "./exportXtx";

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
  const [template, font] = await Promise.all([loadReturnFormTemplate(), loadJapaneseFont()]);
  if (!template) {
    throw new HTTPException(503, {
      message:
        "申告書の様式 PDF を用意できませんでした。サーバーのデータフォルダ forms へ公式様式を配置するか、ネットワーク接続を確認してください。",
    });
  }
  if (!font) {
    throw new HTTPException(503, {
      message:
        "日本語フォントがサーバーに配置されていないため、紙イメージ PDF を生成できません。データフォルダの fonts へ IPAex ゴシック等を配置してください。",
    });
  }
  const transactions = filterYear(normalizeTransactions(body.transactions ?? []), body.year);
  const figures = computeCorrectedFigures(transactions, body.year);
  const tax = computeIncomeTax({
    year: body.year,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: body.deductions,
    taxCredits: body.tax_credits,
  });
  const values = buildReturnFormValues({
    year: body.year,
    amendment: body.amendment,
    submissionDate: body.submission_date,
    taxpayer: toTaxpayer(body.taxpayer),
    figures,
    tax,
    deductionInputs: body.deductions,
    withholdingTax: body.withholding_tax,
    prepaidTax: body.prepaid_tax,
    originalThirdPeriodTax: body.original_third_period_tax,
  });
  let pdf: Uint8Array;
  try {
    pdf = await buildReturnPdf(values, template, font);
  } catch (e) {
    throw new HTTPException(400, {
      message: e instanceof Error ? e.message : "紙イメージ PDF の生成に失敗しました",
    });
  }
  const response: ExportReturnPdfResponse = {
    filename: `shinkokusho-${body.year}${body.amendment ? "-shusei" : "-kakutei"}.pdf`,
    pdf_base64: Buffer.from(pdf).toString("base64"),
  };
  return c.json(response, 200);
};
