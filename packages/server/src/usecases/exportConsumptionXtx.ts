/**
 * exportConsumptionXtx.ts — 消費税申告書（一般用・本則）の XTX 出力ユースケース。
 * DB不要・ステートレス。入力は税区分まで確定した金額（税込）で受け、
 * 申告書の丸め・控除方式の判定は @etax/shared の computeConsumptionReturn、
 * XTXの組み立ては buildConsumptionXtx に委ねる。生成物は署名なしの
 * 組み込み用データで、送信（マイナンバーカード署名）は本人が行う。
 */
import { buildConsumptionXtx, computeConsumptionReturn } from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  ExportConsumptionXtxRequestSchema,
  ExportConsumptionXtxResponse,
  ExportConsumptionXtxResponseSchema,
} from "../schemas/etax";
import { ErrorSchema } from "../schemas/common";
import { toTaxpayer } from "./exportXtx";

export const exportConsumptionXtxRoute = createRoute({
  method: "post",
  path: "/api/etax/export-consumption-xtx",
  operationId: "exportConsumptionXtx",
  tags: ["Etax"],
  summary: "消費税申告書（本則）の e-Tax 申告等データ（XTX）出力（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExportConsumptionXtxRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExportConsumptionXtxResponseSchema } },
      description: "XTXファイル名・内容・合計納付税額",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "リクエストが不正",
    },
  },
});

export const exportConsumptionXtxHandler: RouteHandler<typeof exportConsumptionXtxRoute> = (c) => {
  const body = c.req.valid("json");
  const input = {
    salesIncl10: body.sales_incl_10,
    salesIncl8: body.sales_incl_8,
    nontaxableSales: body.nontaxable_sales,
    exemptSales: body.exempt_sales,
    purchasesIncl10: body.purchases_incl_10,
    purchasesIncl8: body.purchases_incl_8,
    interimNational: body.interim_national,
    interimLocal: body.interim_local,
  };
  const result = computeConsumptionReturn(input);
  let xtx: string;
  try {
    xtx = buildConsumptionXtx({
      taxpayer: toTaxpayer(body.taxpayer),
      periodFrom: body.period_from,
      periodTo: body.period_to,
      submissionDate: body.submission_date,
      filingKind: body.filing_kind,
      basePeriodSalesThousands: body.base_period_sales_thousands,
      input,
      result,
      originalNational: body.original_national,
      originalLocal: body.original_local,
    });
  } catch (e) {
    throw new HTTPException(400, {
      message: e instanceof Error ? e.message : "消費税XTXの生成に失敗しました",
    });
  }
  const year = body.period_from.slice(0, 4);
  const response: ExportConsumptionXtxResponse = {
    filename: `etax-shohi-${year}${body.filing_kind === 3 ? "-shusei" : "-kakutei"}.xtx`,
    xtx,
    total_payable: result.totalPayable,
  };
  return c.json(response, 200);
};
