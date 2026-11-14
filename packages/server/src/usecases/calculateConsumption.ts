/**
 * calculateConsumption.ts — 消費税3方式比較ユースケース（usecases）。
 * DB不要・ステートレス。計算は @etax/shared の決定的な関数が行う。
 */
import {
  aggregateIncome,
  consumptionTax,
  estimateInputTax,
  filterYear,
  normalizeTransactions,
  residentialRentTotal,
  taxableSalesFromBreakdown,
  ConsumptionMethod,
} from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import {
  CalculateConsumptionRequestSchema,
  CalculateConsumptionResponse,
  CalculateConsumptionResponseSchema,
} from "../schemas/calc";
import { ErrorSchema } from "../schemas/common";

export const calculateConsumptionRoute = createRoute({
  method: "post",
  path: "/api/calc/consumption",
  operationId: "calculateConsumption",
  tags: ["Calc"],
  summary: "消費税3方式比較（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CalculateConsumptionRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CalculateConsumptionResponseSchema } },
      description: "消費税3方式の比較結果",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const calculateConsumptionHandler: RouteHandler<typeof calculateConsumptionRoute> = (c) => {
  const body = c.req.valid("json");
  const all = normalizeTransactions(body.transactions ?? []);
  const year = typeof body.year === "number" ? body.year : undefined;
  const tx = year ? filterYear(all, year) : all;
  const b = aggregateIncome(tx);
  const rent = residentialRentTotal(tx);
  const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
  const inputTax = estimateInputTax(tx);
  const methods: ConsumptionMethod[] = ["standard", "simplified", "special20"];
  const results = methods.map((method) =>
    consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, inputTax, method }),
  );
  const response: CalculateConsumptionResponse = {
    year: year ?? null,
    count: tx.length,
    taxable_sales_incl: taxable,
    nontaxable_sales_incl: nontaxable,
    estimated_input_tax: inputTax,
    results,
    note: "仕入税額は経費からの概算です。2割特例・簡易課税の適用可否は要件確認が必要です。",
  };
  return c.json(response, 200);
};
