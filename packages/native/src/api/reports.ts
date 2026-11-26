/**
 * reports.ts — 試算表・資金繰り・freee試算表（実績）のAPI。
 */
import { BalanceSheetWireInput, FilingType, Transaction } from "@etax/shared";
import { apiJson, apiJsonOrNull } from "./client";
import { CashFlowReport, FreeeTrialBalance, TrialBalanceResponse } from "./types";

export interface FetchTrialBalanceRequest {
  transactions: Transaction[];
  year: number;
  filing_type?: FilingType;
  real_estate_business_scale?: boolean;
  balance_sheet?: BalanceSheetWireInput;
}

/** 試算表レポート（当年＋前年）を計算系APIから取得する。 */
export async function fetchTrialBalance(
  request: FetchTrialBalanceRequest,
): Promise<TrialBalanceResponse> {
  return apiJson<TrialBalanceResponse>("/api/calc/trial-balance", {
    method: "POST",
    body: request,
  });
}

export interface FetchCashFlowRequest {
  from?: string;
  months?: number;
  opening_balance?: number;
}

/** 資金繰りレポート（実績＋未消込請求書の入金予定）を取得する。 */
export async function fetchCashFlowReport(
  request: FetchCashFlowRequest = {},
): Promise<CashFlowReport> {
  const params = new URLSearchParams();
  if (request.from) params.set("from", request.from);
  if (request.months !== undefined) params.set("months", String(request.months));
  if (request.opening_balance !== undefined) {
    params.set("opening_balance", String(request.opening_balance));
  }
  const query = params.toString();
  return apiJson<CashFlowReport>(query ? `/api/cash-flow?${query}` : "/api/cash-flow");
}

/** freee試算表（取り込み済みの実績データ）。未取り込みなら null。 */
export async function fetchFreeeTrialBalance(): Promise<FreeeTrialBalance | null> {
  return apiJsonOrNull<FreeeTrialBalance>("/api/freee/trial-balance");
}
