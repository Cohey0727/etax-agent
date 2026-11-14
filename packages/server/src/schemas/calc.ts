/**
 * calc.ts — 計算系エンドポイント（集計・消費税・修正申告の差分）のスキーマ（schemas）。
 *
 * リクエストの transactions / year は、従来どおり寛容に受ける
 * （正規化は @etax/shared の normalizeTransactions が担い、year は
 * 数値のときだけ採用する）。そのため該当フィールドは z.unknown() とし、
 * 検証で弾くのは「JSONオブジェクトでないボディ」だけに留める。
 */
import { z } from "@hono/zod-openapi";

// ---------------------------------------------------------------------------
// 集計（aggregate）
// ---------------------------------------------------------------------------

export const CalculateAggregateRequestSchema = z
  .object({
    transactions: z.unknown().optional(),
    year: z.unknown().optional(),
  })
  .openapi("CalculateAggregateRequest");

export type CalculateAggregateRequest = z.infer<typeof CalculateAggregateRequestSchema>;

export const CalculateAggregateResponseSchema = z
  .object({
    year: z.number().nullable(),
    count: z.number(),
    business_revenue: z.number(),
    business_expenses: z.number(),
    business_income: z.number(),
    real_estate_revenue: z.number(),
    real_estate_expenses: z.number(),
    real_estate_income: z.number(),
    other_revenue: z.number(),
    other_expenses: z.number(),
    blue_deduction_real_estate: z.number(),
    blue_deduction_business: z.number(),
    blue_deduction_total: z.number(),
    business_income_after_blue: z.number(),
    real_estate_income_after_blue: z.number(),
    category_totals: z.record(z.string(), z.number()),
  })
  .openapi("CalculateAggregateResponse");

export type CalculateAggregateResponse = z.infer<typeof CalculateAggregateResponseSchema>;

// ---------------------------------------------------------------------------
// 消費税（consumption）
// ---------------------------------------------------------------------------

export const CalculateConsumptionRequestSchema = z
  .object({
    transactions: z.unknown().optional(),
    year: z.unknown().optional(),
  })
  .openapi("CalculateConsumptionRequest");

export type CalculateConsumptionRequest = z.infer<typeof CalculateConsumptionRequestSchema>;

export const ConsumptionTaxResultSchema = z
  .object({
    method: z.enum(["standard", "simplified", "special20"]),
    taxableSalesIncl: z.number(),
    nontaxableSalesIncl: z.number(),
    outputTax: z.number(),
    inputTax: z.number(),
    payable: z.number(),
    detail: z.record(z.string(), z.unknown()),
  })
  .openapi("ConsumptionTaxResult");

export type ConsumptionTaxResultResponse = z.infer<typeof ConsumptionTaxResultSchema>;

export const CalculateConsumptionResponseSchema = z
  .object({
    year: z.number().nullable(),
    count: z.number(),
    taxable_sales_incl: z.number(),
    nontaxable_sales_incl: z.number(),
    estimated_input_tax: z.number(),
    results: z.array(ConsumptionTaxResultSchema),
    note: z.string(),
  })
  .openapi("CalculateConsumptionResponse");

export type CalculateConsumptionResponse = z.infer<typeof CalculateConsumptionResponseSchema>;

// ---------------------------------------------------------------------------
// 修正申告の差分（amend）
// ---------------------------------------------------------------------------

export const CalculateAmendmentRequestSchema = z
  .object({
    original: z.record(z.string(), z.unknown()),
    corrected: z.record(z.string(), z.unknown()),
    year: z.unknown().optional(),
  })
  .openapi("CalculateAmendmentRequest");

export type CalculateAmendmentRequest = z.infer<typeof CalculateAmendmentRequestSchema>;

export const FieldDiffSchema = z
  .object({
    original: z.unknown(),
    corrected: z.unknown(),
    diff: z.number().nullable(),
  })
  .openapi("FieldDiff");

export const CalculateAmendmentResponseSchema = z
  .object({
    year: z.number(),
    field_diffs: z.record(z.string(), FieldDiffSchema),
    tax_delta: z.number().nullable(),
  })
  .openapi("CalculateAmendmentResponse");

export type CalculateAmendmentResponse = z.infer<typeof CalculateAmendmentResponseSchema>;

// ---------------------------------------------------------------------------
// 所得税額（income-tax）: 所得控除・税額控除 → 確定税額
// ---------------------------------------------------------------------------

export const LifeInsurancePremiumsSchema = z
  .object({
    newGeneral: z.number(),
    newCareMedical: z.number(),
    newPension: z.number(),
    oldGeneral: z.number(),
    oldPension: z.number(),
  })
  .openapi("LifeInsurancePremiums");

export const EarthquakeInsurancePremiumsSchema = z
  .object({
    earthquake: z.number(),
    oldLongTerm: z.number(),
  })
  .openapi("EarthquakeInsurancePremiums");

export const CasualtyLossInputSchema = z
  .object({
    damageAmount: z.number(),
    disasterRelatedExpenses: z.number(),
    otherRelatedExpenses: z.number(),
    compensation: z.number(),
  })
  .openapi("CasualtyLossInput");

export const DeductionInputsSchema = z
  .object({
    socialInsurancePaid: z.number(),
    smallBusinessMutualAidPaid: z.number(),
    lifeInsurance: LifeInsurancePremiumsSchema,
    earthquakeInsurance: EarthquakeInsurancePremiumsSchema,
    medicalExpensesPaid: z.number(),
    medicalReimbursement: z.number(),
    donationsTotal: z.number(),
    casualtyLoss: CasualtyLossInputSchema.nullable(),
    spouseCategory: z.enum(["none", "general", "elderly"]),
    spouseTotalIncome: z.number().nullable(),
    dependents: z.object({
      general: z.number(),
      specific: z.number(),
      elderly: z.number(),
      elderlyCohabiting: z.number(),
    }),
    disability: z.object({
      general: z.number(),
      special: z.number(),
      specialCohabiting: z.number(),
    }),
    isWidow: z.boolean(),
    isSingleParent: z.boolean(),
    isWorkingStudent: z.boolean(),
    specialRelativeTotalIncome: z.number().nullable(),
  })
  .openapi("DeductionInputs");

export const TaxCreditInputsSchema = z
  .object({
    housingLoanBalance: z.number(),
    housingLoanLimit: z.number(),
    dividendCorporate: z.number(),
    dividendTrust: z.number(),
    politicalDonations: z.number(),
    certifiedNpoDonations: z.number(),
    seismicRetrofitStandardCost: z.number(),
    seismicRetrofitOtherCost: z.number(),
    foreignTaxPaid: z.number(),
    foreignIncome: z.number(),
  })
  .openapi("TaxCreditInputs");

export const CalculateIncomeTaxRequestSchema = z
  .object({
    year: z.number(),
    totalIncome: z.number(),
    deductions: DeductionInputsSchema,
    taxCredits: TaxCreditInputsSchema,
  })
  .openapi("CalculateIncomeTaxRequest");

export type CalculateIncomeTaxRequest = z.infer<typeof CalculateIncomeTaxRequestSchema>;

export const IncomeDeductionBreakdownSchema = z
  .object({
    casualtyLoss: z.number(),
    medical: z.number(),
    socialInsurance: z.number(),
    smallBusinessMutualAid: z.number(),
    lifeInsurance: z.number(),
    earthquakeInsurance: z.number(),
    donations: z.number(),
    disability: z.number(),
    widow: z.number(),
    singleParent: z.number(),
    workingStudent: z.number(),
    spouse: z.number(),
    spouseSpecial: z.number(),
    dependents: z.number(),
    specialRelative: z.number(),
    basic: z.number(),
    total: z.number(),
  })
  .openapi("IncomeDeductionBreakdown");

export const TaxCreditBreakdownSchema = z
  .object({
    housingLoan: z.number(),
    dividend: z.number(),
    politicalDonations: z.number(),
    certifiedNpoDonations: z.number(),
    seismicRetrofit: z.number(),
    foreignTax: z.number(),
    total: z.number(),
  })
  .openapi("TaxCreditBreakdown");

export const CalculateIncomeTaxResponseSchema = z
  .object({
    year: z.number(),
    total_income: z.number(),
    deductions: IncomeDeductionBreakdownSchema,
    deductions_total: z.number(),
    taxable_income: z.number(),
    income_tax_base: z.number(),
    tax_credits: TaxCreditBreakdownSchema,
    tax_credits_total: z.number(),
    reconstruction_tax: z.number(),
    final_tax: z.number(),
  })
  .openapi("CalculateIncomeTaxResponse");

export type CalculateIncomeTaxResponse = z.infer<typeof CalculateIncomeTaxResponseSchema>;
