/**
 * getCashFlowReport.ts — 資金繰りレポート取得ユースケース（usecases）。DB必須。
 *
 * 実績（帳簿の取引）と入金予定（未消込の請求書）から、月次の将来残高を
 * 返す。組み立ては services/cashFlow に一本化し、MCP ツールと同じ結果を
 * 返す。数値は「登録済み予定に基づく試算」であり、税務判断は含まない。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { defaultValidationMessage } from "../lib/validationHook";
import { ErrorSchema } from "../schemas/common";
import {
  CASH_FLOW_MAX_MONTHS,
  CashFlowReportResponse,
  CashFlowReportResponseSchema,
  GetCashFlowReportQuerySchema,
} from "../schemas/cashFlow";
import {
  CashFlowReportParams,
  fetchCashFlowReport,
} from "../services/cashFlow/getCashFlowReportData";

export const getCashFlowReportRoute = createRoute({
  method: "get",
  path: "/api/cash-flow",
  operationId: "getCashFlowReport",
  tags: ["CashFlow"],
  summary: "資金繰りレポート（実績＋未消込請求書の入金予定、DB必須）",
  request: { query: GetCashFlowReportQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: CashFlowReportResponseSchema } },
      description: "資金繰りレポート",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "クエリパラメータが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

/** クエリの検証に失敗したときの文言。月数・期首残高は受け付ける値の範囲を示す。 */
export function getCashFlowReportValidationMessage(issuePaths: string[]): string {
  if (issuePaths.includes("months")) {
    return `months は1〜${CASH_FLOW_MAX_MONTHS}の整数で指定してください`;
  }
  if (issuePaths.includes("opening_balance")) {
    return "opening_balance は整数で指定してください";
  }
  return defaultValidationMessage(issuePaths);
}

export const getCashFlowReportHandler: RouteHandler<typeof getCashFlowReportRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const query = c.req.valid("query");
  const params: CashFlowReportParams = {
    fromMonth: query.from,
    monthCount: query.months,
    openingBalance: query.opening_balance,
  };
  let response: CashFlowReportResponse;
  try {
    response = await fetchCashFlowReport(db, params);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
