/**
 * exportConsumptionXtx.ts — 消費税申告書の XTX 出力ユースケース。
 * DB不要・ステートレス。入力は税区分まで確定した金額（税込）で受け、
 * 申告書の丸め・控除方式の判定は @etax/shared の決定的な計算関数、
 * XTXの組み立ては buildConsumptionXtx（本則）/
 * buildSimplifiedConsumptionXtx（簡易課税）に委ねる。生成物は署名なしの
 * 組み込み用データで、送信（マイナンバーカード署名）は本人が行う。
 */
import {
  SimplifiedCategory,
  SimplifiedConsumptionInput,
  Special20ConsumptionInput,
  buildConsumptionXtx,
  buildSimplifiedConsumptionXtx,
  buildSpecial20ConsumptionXtx,
  computeConsumptionReturn,
  computeSimplifiedConsumptionReturn,
  computeSpecial20ConsumptionReturn,
} from "@etax/shared";
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
  summary: "消費税申告書（本則／簡易課税）の e-Tax 申告等データ（XTX）出力（DB不要）",
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
  const year = body.period_from.slice(0, 4);

  if (body.method === "simplified") {
    const salesByCategory: SimplifiedConsumptionInput["salesByCategory"] = {};
    if (body.sales_by_category) {
      for (const [key, value] of Object.entries(body.sales_by_category)) {
        salesByCategory[Number(key) as SimplifiedCategory] = {
          incl10: value.incl_10,
          incl8: value.incl_8,
        };
      }
    } else {
      salesByCategory[body.business_category ?? 5] = {
        incl10: body.sales_incl_10,
        incl8: body.sales_incl_8,
      };
    }
    const simplifiedInput: SimplifiedConsumptionInput = {
      salesByCategory,
      nontaxableSales: body.nontaxable_sales,
      exemptSales: body.exempt_sales,
      returnsIncl10: body.returns_incl_10 ?? 0,
      returnsIncl8: body.returns_incl_8 ?? 0,
      badDebtRecoveryTax10: body.bad_debt_recovery_tax_10 ?? 0,
      badDebtRecoveryTax8: body.bad_debt_recovery_tax_8 ?? 0,
      badDebtTax10: body.bad_debt_tax_10 ?? 0,
      badDebtTax8: body.bad_debt_tax_8 ?? 0,
      interimNational: body.interim_national,
      interimLocal: body.interim_local,
    };
    const simplifiedResult = computeSimplifiedConsumptionReturn(simplifiedInput);
    let xtx: string;
    try {
      xtx = buildSimplifiedConsumptionXtx({
        taxpayer: toTaxpayer(body.taxpayer),
        periodFrom: body.period_from,
        periodTo: body.period_to,
        submissionDate: body.submission_date,
        filingKind: body.filing_kind,
        basePeriodSales: body.base_period_sales_thousands * 1000,
        input: simplifiedInput,
        result: simplifiedResult,
        originalNational: body.original_national,
        originalLocal: body.original_local,
      });
    } catch (e) {
      throw new HTTPException(400, {
        message: e instanceof Error ? e.message : "消費税XTXの生成に失敗しました",
      });
    }
    const response: ExportConsumptionXtxResponse = {
      filename: `etax-shohi-${year}-kanni${body.filing_kind === 3 ? "-shusei" : "-kakutei"}.xtx`,
      xtx,
      total_payable: simplifiedResult.totalPayable,
    };
    return c.json(response, 200);
  }

  if (body.method === "special20") {
    const specialInput: Special20ConsumptionInput = {
      salesIncl10: body.sales_incl_10,
      salesIncl8: body.sales_incl_8,
      nontaxableSales: body.nontaxable_sales,
      exemptSales: body.exempt_sales,
      returnsIncl10: body.returns_incl_10 ?? 0,
      returnsIncl8: body.returns_incl_8 ?? 0,
      badDebtRecoveryTax10: body.bad_debt_recovery_tax_10 ?? 0,
      badDebtRecoveryTax8: body.bad_debt_recovery_tax_8 ?? 0,
      badDebtTax10: body.bad_debt_tax_10 ?? 0,
      badDebtTax8: body.bad_debt_tax_8 ?? 0,
      interimNational: body.interim_national,
      interimLocal: body.interim_local,
    };
    const specialResult = computeSpecial20ConsumptionReturn(specialInput);
    let xtx: string;
    try {
      xtx = buildSpecial20ConsumptionXtx({
        taxpayer: toTaxpayer(body.taxpayer),
        periodFrom: body.period_from,
        periodTo: body.period_to,
        submissionDate: body.submission_date,
        filingKind: body.filing_kind,
        basePeriodSalesThousands: body.base_period_sales_thousands,
        input: specialInput,
        result: specialResult,
        originalNational: body.original_national,
        originalLocal: body.original_local,
      });
    } catch (e) {
      throw new HTTPException(400, {
        message: e instanceof Error ? e.message : "消費税XTXの生成に失敗しました",
      });
    }
    const response: ExportConsumptionXtxResponse = {
      filename: `etax-shohi-${year}-special20${body.filing_kind === 3 ? "-shusei" : "-kakutei"}.xtx`,
      xtx,
      total_payable: specialResult.totalPayable,
    };
    return c.json(response, 200);
  }

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
  const response: ExportConsumptionXtxResponse = {
    filename: `etax-shohi-${year}${body.filing_kind === 3 ? "-shusei" : "-kakutei"}.xtx`,
    xtx,
    total_payable: result.totalPayable,
  };
  return c.json(response, 200);
};
