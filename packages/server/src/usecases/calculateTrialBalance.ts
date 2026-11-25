import {
  buildTrialBalance,
  normalizeTransactions,
  type FilingType,
  type TrialBalance,
  type XtxBalanceSheetInput,
} from "@etax/shared";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { BalanceSheetInputSchema } from "../schemas/etax";
import { CalculateTrialBalanceRequestSchema } from "../schemas/trialBalance";
import { balanceSheetFromWire } from "./exportXtx";

/**
 * 試算表レポート（Issue #18）。帳簿の取引から、XTXの青色申告決算書と
 * 数値が一致する損益計算書・月次推移を返す。前年比較用に前年分も
 * 同梱する（貸借対照表は当年の入力分のみ）。
 * 集計そのものは shared の buildTrialBalance が担う（二重実装にしない）。
 */
export const calculateTrialBalanceRoute = {
  method: "post",
  path: "/api/calc/trial-balance",
  request: {
    body: {
      content: {
        "application/json": { schema: CalculateTrialBalanceRequestSchema },
      },
    },
  },
  responses: { 200: { description: "試算表（当年＋前年）" } },
} as const;

export type TrialBalanceResponse = TrialBalance & { previous: TrialBalance };

export async function calculateTrialBalanceHandler(c: Context) {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const year = typeof body.year === "number" ? Math.trunc(body.year) : Number.NaN;
  if (!Number.isFinite(year) || year <= 0) {
    throw new HTTPException(400, { message: "year が必要です" });
  }
  const transactions = normalizeTransactions(body.transactions);
  const filingType =
    typeof body.filing_type === "string" ? (body.filing_type as FilingType) : undefined;
  const realEstateBusinessScale =
    typeof body.real_estate_business_scale === "boolean"
      ? body.real_estate_business_scale
      : undefined;
  let balanceSheet: XtxBalanceSheetInput | undefined;
  if (body.balance_sheet !== undefined) {
    const parsed = BalanceSheetInputSchema.safeParse(body.balance_sheet);
    if (!parsed.success) {
      throw new HTTPException(400, { message: "balance_sheet の形式が正しくありません" });
    }
    balanceSheet = balanceSheetFromWire({ balance_sheet: parsed.data });
  }
  const options = { filingType, realEstateBusinessScale };
  const current = buildTrialBalance(transactions, year, { ...options, balanceSheet });
  const previous = buildTrialBalance(transactions, year - 1, options);
  const response: TrialBalanceResponse = { ...current, previous };
  return c.json(response);
}
