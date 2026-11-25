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
    housingLoanRate: z.number(),
    dividendCorporate: z.number(),
    dividendTrust: z.number(),
    politicalDonations: z.number(),
    certifiedNpoDonations: z.number(),
    seismicRetrofitStandardCost: z.number(),
    seismicRetrofitOtherCost: z.number(),
    foreignTaxPaid: z.number(),
    foreignIncome: z.number(),
    flatReduction: z.number(),
  })
  .openapi("TaxCreditInputs");

/** 一時所得の入力（Issue #27 Phase A） */
export const TempIncomeInputSchema = z
  .object({
    revenue: z.number(),
    expenses: z.number(),
  })
  .openapi("TempIncomeInput");

/** 配当所得の入力（Issue #27 Phase B）。listedMode は上場配当等全体の課税方式。 */
export const DividendIncomeInputSchema = z
  .object({
    listedRevenue: z.number(),
    listedTrustRevenue: z.number(),
    listedWithholding: z.number(),
    listedMode: z.enum(["comprehensive", "separate", "none"]),
    generalRevenue: z.number(),
    generalTrustRevenue: z.number(),
    generalWithholding: z.number(),
    interestExpense: z.number(),
  })
  .openapi("DividendIncomeInput");

/** 株式等譲渡の区分（一般／上場）入力（Issue #27 Phase C） */
export const StockTransferCategoryInputSchema = z
  .object({
    revenue: z.number(),
    otherRevenue: z.number(),
    acquisitionCost: z.number(),
    transferFees: z.number(),
    otherExpenses: z.number(),
  })
  .openapi("StockTransferCategoryInput");

/** 特定口座（源泉徴収口座）の明細行（Issue #27 Phase C） */
export const SpecialAccountInputSchema = z
  .object({
    brokerName: z.string(),
    branchName: z.string(),
    withholdingAccount: z.boolean(),
    revenue: z.number(),
    cost: z.number(),
    withholding: z.number(),
  })
  .openapi("SpecialAccountInput");

/** 株式等譲渡の入力（Issue #27 Phase C） */
export const StockTransferInputSchema = z
  .object({
    general: StockTransferCategoryInputSchema,
    listed: StockTransferCategoryInputSchema,
    listedWithholding: z.number(),
    specialAccounts: z.array(SpecialAccountInputSchema),
  })
  .openapi("StockTransferInput");

/** 拡張所得の入力（配当・一時・株式等譲渡、Issue #27） */
export const ExpandedIncomeInputSchema = z
  .object({
    temp: TempIncomeInputSchema,
    dividend: DividendIncomeInputSchema,
    stocks: StockTransferInputSchema,
  })
  .openapi("ExpandedIncomeInput");

export const CalculateIncomeTaxRequestSchema = z
  .object({
    year: z.number(),
    totalIncome: z.number(),
    deductions: DeductionInputsSchema,
    taxCredits: TaxCreditInputsSchema,
    /** 配当・一時・株式等譲渡の入力（任意）。totalIncome は拡張分を含まない総合課税分の所得として渡す */
    expandedIncome: ExpandedIncomeInputSchema.optional(),
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
    flatReduction: z.number(),
    dividend: z.number(),
    politicalDonations: z.number(),
    certifiedNpoDonations: z.number(),
    seismicRetrofit: z.number(),
    foreignTax: z.number(),
    total: z.number(),
  })
  .openapi("TaxCreditBreakdown");

export const TempIncomeBreakdownSchema = z
  .object({
    revenue: z.number(),
    expenses: z.number(),
    specialDeduction: z.number(),
    amount: z.number(),
    includedAmount: z.number(),
  })
  .openapi("TempIncomeBreakdown");

export const DividendIncomeBreakdownSchema = z
  .object({
    listedMode: z.enum(["comprehensive", "separate", "none"]),
    comprehensiveRevenue: z.number(),
    separateRevenue: z.number(),
    interestComprehensive: z.number(),
    interestSeparate: z.number(),
    comprehensiveIncome: z.number(),
    separateIncome: z.number(),
    creditCorporate: z.number(),
    creditTrust: z.number(),
    withholding: z.number(),
  })
  .openapi("DividendIncomeBreakdown");

export const StockTransferCategoryBreakdownSchema = z
  .object({
    revenue: z.number(),
    otherRevenue: z.number(),
    acquisitionCost: z.number(),
    transferFees: z.number(),
    otherExpenses: z.number(),
    revenueTotal: z.number(),
    costTotal: z.number(),
    income: z.number(),
  })
  .openapi("StockTransferCategoryBreakdown");

export const StockTransferBreakdownSchema = z
  .object({
    general: StockTransferCategoryBreakdownSchema,
    listed: StockTransferCategoryBreakdownSchema,
    specialAccountsTotal: z.object({
      revenue: z.number(),
      cost: z.number(),
      withholding: z.number(),
      count: z.number(),
    }),
    withholding: z.number(),
  })
  .openapi("StockTransferBreakdown");

export const ExpandedIncomeBreakdownSchema = z
  .object({
    temp: TempIncomeBreakdownSchema,
    dividend: DividendIncomeBreakdownSchema,
    stocks: StockTransferBreakdownSchema,
    dividendDeclared: z.boolean(),
    comprehensiveAddition: z.number(),
    separateStockIncome: z.number(),
    separateDividendIncome: z.number(),
    listedLossOffsetToDividend: z.number(),
    unabsorbedListedLoss: z.number(),
    hasSeparateTaxation: z.boolean(),
    hasStockTransfer: z.boolean(),
  })
  .openapi("ExpandedIncomeBreakdown");

export const CalculateIncomeTaxResponseSchema = z
  .object({
    year: z.number(),
    total_income: z.number(),
    /** 合計所得金額（総合課税分＋申告分離分） */
    grand_total_income: z.number(),
    deductions: IncomeDeductionBreakdownSchema,
    deductions_total: z.number(),
    taxable_income: z.number(),
    /** 課税株式等譲渡所得金額（申告分離） */
    taxable_separate_stocks: z.number(),
    /** 課税上場株式等の配当等の金額（申告分離） */
    taxable_separate_dividends: z.number(),
    income_tax_base: z.number(),
    /** 所得税額のうち総合課税分 */
    income_tax_comprehensive: z.number(),
    /** 所得税額のうち株式等譲渡の申告分離分 */
    income_tax_separate_stocks: z.number(),
    /** 所得税額のうち上場配当の申告分離分 */
    income_tax_separate_dividends: z.number(),
    /** 所得税額のうち申告分離分の合計 */
    income_tax_separate_total: z.number(),
    /** 拡張所得の計算内訳（入力がない場合は null） */
    expanded_income: ExpandedIncomeBreakdownSchema.nullable(),
    tax_credits: TaxCreditBreakdownSchema,
    tax_credits_total: z.number(),
    reconstruction_tax: z.number(),
    final_tax: z.number(),
  })
  .openapi("CalculateIncomeTaxResponse");

export type CalculateIncomeTaxResponse = z.infer<typeof CalculateIncomeTaxResponseSchema>;
