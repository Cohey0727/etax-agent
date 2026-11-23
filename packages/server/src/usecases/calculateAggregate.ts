/**
 * calculateAggregate.ts — 所得集計＋青色申告特別控除ユースケース（usecases）。
 * DB不要・ステートレス。計算は @etax/shared の決定的な関数が行う。
 */
import {
  aggregateIncome,
  blueDeduction,
  categoryTotals,
  filterYear,
  normalizeTransactions,
  Transaction,
} from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import {
  CalculateAggregateRequestSchema,
  CalculateAggregateResponse,
  CalculateAggregateResponseSchema,
} from "../schemas/calc";
import { ErrorSchema } from "../schemas/common";

export const calculateAggregateRoute = createRoute({
  method: "post",
  path: "/api/calc/aggregate",
  operationId: "calculateAggregate",
  tags: ["Calc"],
  summary: "所得集計＋青色申告特別控除（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CalculateAggregateRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CalculateAggregateResponseSchema } },
      description: "集計結果",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

/** 取引を集計し、青色申告特別控除まで計算した API レスポンスを作る。 */
function aggregateResult(transactions: Transaction[], year?: number): CalculateAggregateResponse {
  const tx = year ? filterYear(transactions, year) : transactions;
  const b = aggregateIncome(tx);
  const blue = blueDeduction(b.realEstateIncome, b.businessIncome);
  return {
    year: year ?? null,
    count: tx.length,
    business_revenue: b.businessRevenue,
    business_expenses: b.businessExpenses,
    business_income: b.businessIncome,
    real_estate_revenue: b.realEstateRevenue,
    real_estate_expenses: b.realEstateExpenses,
    real_estate_income: b.realEstateIncome,
    other_revenue: b.otherRevenue,
    other_expenses: b.otherExpenses,
    blue_deduction_real_estate: blue.realEstate,
    blue_deduction_business: blue.business,
    blue_deduction_total: blue.total,
    business_income_after_blue: b.businessIncome - blue.business,
    real_estate_income_after_blue: b.realEstateIncome - blue.realEstate,
    category_totals: categoryTotals(tx),
  };
}

export const calculateAggregateHandler: RouteHandler<typeof calculateAggregateRoute> = (c) => {
  const body = c.req.valid("json");
  const transactions = normalizeTransactions(body.transactions ?? []);
  const year = typeof body.year === "number" ? body.year : undefined;
  return c.json(aggregateResult(transactions, year), 200);
};
