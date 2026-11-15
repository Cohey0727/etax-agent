/**
 * exportXtx.ts — e-Tax 申告等データ（XTX）出力ユースケース（usecases）。
 * DB不要・ステートレス。数値計算はすべて @etax/shared の決定的な関数が行い、
 * XTXの組み立ては buildXtxFiling に委ねる。生成物は署名なしの組み込み用
 * データで、送信（マイナンバーカード署名）は e-Tax 側で本人が行う。
 */
import {
  Transaction,
  XtxTaxpayer,
  buildXtxFiling,
  categoryTotals,
  computeCorrectedFigures,
  computeIncomeTax,
  filterYear,
  normalizeTransactions,
} from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  ExportXtxRequest,
  ExportXtxRequestSchema,
  ExportXtxResponse,
  ExportXtxResponseSchema,
} from "../schemas/etax";
import { ErrorSchema } from "../schemas/common";

export const exportXtxRoute = createRoute({
  method: "post",
  path: "/api/etax/export-xtx",
  operationId: "exportXtx",
  tags: ["Etax"],
  summary: "e-Tax 申告等データ（XTX）の出力（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExportXtxRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExportXtxResponseSchema } },
      description: "XTXファイル名と内容",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "リクエストが不正、または対応外の年分",
    },
  },
});

/**
 * 決算書の経費欄に渡す科目別合計を作る。支出は正の金額（絶対値）に揃え、
 * 不動産の家賃収入だけは収入として正のまま残す。
 * MCP の export_xtx ツールからも使うため export する。
 */
export function statementCategoryTotals(
  transactions: Transaction[],
  incomeType: Transaction["income_type"],
): Record<string, number> {
  const totals = categoryTotals(transactions.filter((t) => t.income_type === incomeType));
  const result: Record<string, number> = {};
  for (const [category, value] of Object.entries(totals)) {
    if (category === "家賃収入") {
      if (value > 0) result[category] = value;
    } else if (value < 0) {
      result[category] = -value;
    }
  }
  return result;
}

/** ワイヤ形式の納税者情報を XTX ビルダーの形式へ変換する。MCP からも使う。 */
export function toTaxpayer(t: ExportXtxRequest["taxpayer"]): XtxTaxpayer {
  return {
    name: t.name,
    nameKana: t.name_kana,
    zipCode: t.zip_code,
    address: t.address,
    addressLine2: t.address_line2,
    birthDate: t.birth_date,
    phone: t.phone,
    taxOfficeName: t.tax_office_name,
    taxOfficeCode: t.tax_office_code,
    myNumber: t.my_number,
    occupation: t.occupation,
    shopName: t.shop_name,
    jan1Address: t.jan1_address,
  };
}

export const exportXtxHandler: RouteHandler<typeof exportXtxRoute> = (c) => {
  const body = c.req.valid("json");
  const transactions = filterYear(normalizeTransactions(body.transactions ?? []), body.year);
  const figures = computeCorrectedFigures(transactions, body.year, {
    filingType: body.filing_type,
    realEstateBusinessScale: body.real_estate_business_scale,
  });
  const tax = computeIncomeTax({
    year: body.year,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: body.deductions,
    taxCredits: body.tax_credits,
  });
  let xtx: string;
  try {
    xtx = buildXtxFiling({
      year: body.year,
      amendment: body.amendment,
      submissionDate: body.submission_date,
      taxpayer: toTaxpayer(body.taxpayer),
      figures,
      deductionInputs: body.deductions,
      tax,
      categoryTotals: {
        business: statementCategoryTotals(transactions, "business"),
        realEstate: statementCategoryTotals(transactions, "real_estate"),
      },
      withholdingTax: body.withholding_tax,
      prepaidTax: body.prepaid_tax,
      originalThirdPeriodTax: body.original_third_period_tax,
    });
  } catch (e) {
    throw new HTTPException(400, {
      message: e instanceof Error ? e.message : "XTXの生成に失敗しました",
    });
  }
  const response: ExportXtxResponse = {
    filename: `etax-shotoku-${body.year}${body.amendment ? "-shusei" : "-kakutei"}.xtx`,
    xtx,
  };
  return c.json(response, 200);
};
