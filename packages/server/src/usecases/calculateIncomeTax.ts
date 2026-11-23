/**
 * calculateIncomeTax.ts — 所得税額ユースケース（usecases）。
 * DB不要・ステートレス。計算は @etax/shared の computeIncomeTax が行う
 * （所得控除 → 課税所得 → 速算表 → 税額控除 → 復興特別所得税 → 確定税額）。
 */
import { computeIncomeTax } from "@etax/shared";
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import {
  CalculateIncomeTaxRequestSchema,
  CalculateIncomeTaxResponse,
  CalculateIncomeTaxResponseSchema,
} from "../schemas/calc";
import { ErrorSchema } from "../schemas/common";

export const calculateIncomeTaxRoute = createRoute({
  method: "post",
  path: "/api/calc/income-tax",
  operationId: "calculateIncomeTax",
  tags: ["Calc"],
  summary: "所得税額の計算（所得控除・税額控除を含む、DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: CalculateIncomeTaxRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: CalculateIncomeTaxResponseSchema } },
      description: "所得税額の計算結果",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
  },
});

export const calculateIncomeTaxHandler: RouteHandler<typeof calculateIncomeTaxRoute> = (c) => {
  const body = c.req.valid("json");
  const result = computeIncomeTax({
    year: body.year,
    totalIncome: body.totalIncome,
    deductions: body.deductions,
    taxCredits: body.taxCredits,
  });
  const response: CalculateIncomeTaxResponse = {
    year: result.year,
    total_income: result.totalIncome,
    deductions: result.deductions,
    deductions_total: result.deductionsTotal,
    taxable_income: result.taxableIncome,
    income_tax_base: result.incomeTaxBase,
    tax_credits: result.taxCredits,
    tax_credits_total: result.taxCreditsTotal,
    reconstruction_tax: result.reconstructionTax,
    final_tax: result.finalTax,
  };
  return c.json(response, 200);
};
