/**
 * calculateIncomeTax.ts — 所得税額ユースケース（usecases）。
 * DB不要・ステートレス。計算は @etax/shared の computeIncomeTax が行う
 * （所得控除 → 課税所得 → 速算表 → 税額控除 → 復興特別所得税 → 確定税額）。
 */
import {
  computeAgricultureStatement,
  computeExpandedIncomes,
  computeIncomeTax,
  normalizeAgricultureInput,
  normalizeExpandedIncomeInput,
  resolveTaxCreditInputs,
} from "@etax/shared";
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
  // 拡張所得（配当・一時・株式等譲渡）がある場合は、総合課税分への加算・
  // 配当控除の対象額の解決・申告分離課税を共通の配線で反映する
  const expanded = body.expandedIncome
    ? computeExpandedIncomes(normalizeExpandedIncomeInput(body.expandedIncome))
    : undefined;
  // 農業所得: 決算書の計算内訳を返す。農業所得そのものは
  // 事業所得の一部として totalIncome に含めて渡される前提（青色申告
  // 特別控除の配分は申告数値の計算側で行う）。
  const agriculture = body.agriculture
    ? computeAgricultureStatement(normalizeAgricultureInput(body.agriculture))
    : undefined;
  const result = computeIncomeTax({
    year: body.year,
    totalIncome: body.totalIncome + (expanded?.comprehensiveAddition ?? 0),
    deductions: body.deductions,
    taxCredits: expanded ? resolveTaxCreditInputs(body.taxCredits, expanded) : body.taxCredits,
    separateTaxation: expanded
      ? { stockIncome: expanded.separateStockIncome, dividendIncome: expanded.separateDividendIncome }
      : undefined,
  });
  const response: CalculateIncomeTaxResponse = {
    year: result.year,
    total_income: result.totalIncome,
    grand_total_income: result.grandTotalIncome,
    deductions: result.deductions,
    deductions_total: result.deductionsTotal,
    taxable_income: result.taxableIncome,
    taxable_separate_stocks: result.taxableSeparateStocks,
    taxable_separate_dividends: result.taxableSeparateDividends,
    income_tax_base: result.incomeTaxBase,
    income_tax_comprehensive: result.incomeTaxComprehensive,
    income_tax_separate_stocks: result.incomeTaxSeparateStocks,
    income_tax_separate_dividends: result.incomeTaxSeparateDividends,
    income_tax_separate_total: result.incomeTaxSeparateTotal,
    expanded_income: expanded ?? null,
    agriculture: agriculture ?? null,
    tax_credits: result.taxCredits,
    tax_credits_total: result.taxCreditsTotal,
    reconstruction_tax: result.reconstructionTax,
    final_tax: result.finalTax,
  };
  return c.json(response, 200);
};
