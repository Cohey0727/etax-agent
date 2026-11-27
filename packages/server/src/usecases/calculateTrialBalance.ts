/**
 * calculateTrialBalance.ts — 試算表レポートのユースケース（usecases）。
 * DB不要・ステートレス。帳簿の取引から、XTX の青色申告決算書と数値が一致する
 * 損益計算書・月次推移を返す。前年比較用に前年分も同梱する（貸借対照表は
 * 当年の入力分のみ）。集計そのものは shared の buildTrialBalance が担う。
 */
import { buildTrialBalance, normalizeTransactions, TrialBalance } from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { ErrorSchema } from "../schemas/common";
import { CalculateTrialBalanceRequestSchema } from "../schemas/trialBalance";
import { balanceSheetFromWire } from "./exportXtx";

export const calculateTrialBalanceRoute = createRoute({
  method: "post",
  path: "/api/calc/trial-balance",
  operationId: "calculateTrialBalance",
  tags: ["Calc"],
  summary: "試算表（当年＋前年、DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CalculateTrialBalanceRequestSchema } },
    },
  },
  responses: {
    200: { description: "試算表（当年＋前年）" },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディ・year・balance_sheet が不正",
    },
  },
});

export type TrialBalanceResponse = TrialBalance & { previous: TrialBalance };

/** バリデーション失敗時の文言。year と貸借対照表の不備はそれぞれの項目名で示す。 */
export function calculateTrialBalanceValidationMessage(issuePaths: string[]): string {
  if (issuePaths.includes("year")) return "year が必要です";
  if (issuePaths.some((path) => path === "balance_sheet" || path.startsWith("balance_sheet."))) {
    return "balance_sheet の形式が正しくありません";
  }
  return "JSONボディが必要です";
}

export const calculateTrialBalanceHandler: RouteHandler<typeof calculateTrialBalanceRoute> = (
  c,
) => {
  const body = c.req.valid("json");
  const year = Math.trunc(body.year);
  const transactions = normalizeTransactions(body.transactions);
  const options = {
    filingType: body.filing_type,
    realEstateBusinessScale: body.real_estate_business_scale,
  };
  const current = buildTrialBalance(transactions, year, {
    ...options,
    balanceSheet: balanceSheetFromWire(body),
  });
  const previous = buildTrialBalance(transactions, year - 1, options);
  const response: TrialBalanceResponse = { ...current, previous };
  return c.json(response, 200);
};
