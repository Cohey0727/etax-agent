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
import { ErrorSchema } from "../schemas/common";
import {
  CashFlowReportResponse,
  CashFlowReportResponseSchema,
  GetCashFlowReportQuerySchema,
} from "../schemas/cashFlow";
import {
  fetchCashFlowReport,
  type CashFlowReportParams,
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

/** 表示月数の上限（2年分まで）。 */
export const CASH_FLOW_MAX_MONTHS = 24;

function parseMonths(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > CASH_FLOW_MAX_MONTHS) {
    throw new HTTPException(400, {
      message: `months は1〜${CASH_FLOW_MAX_MONTHS}の整数で指定してください`,
    });
  }
  return value;
}

function parseOpeningBalance(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new HTTPException(400, { message: "opening_balance は整数で指定してください" });
  }
  return value;
}

export const getCashFlowReportHandler: RouteHandler<typeof getCashFlowReportRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const query = c.req.valid("query");
  const params: CashFlowReportParams = {
    fromMonth: query.from,
    monthCount: parseMonths(query.months),
    openingBalance: parseOpeningBalance(query.opening_balance),
  };
  let response: CashFlowReportResponse;
  try {
    response = await fetchCashFlowReport(db, params);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
