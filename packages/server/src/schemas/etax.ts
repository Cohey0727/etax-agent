/**
 * etax.ts — e-Tax 申告等データ（XTX）出力エンドポイントのスキーマ（schemas）。
 *
 * 納税者情報はワイヤ形式（snake_case）で受け、usecase で @etax/shared の
 * XtxTaxpayer に詰め替える。控除・税額控除の入力スキーマは calc と共通。
 * transactions は他の計算系エンドポイントと同様に寛容に受け、
 * 正規化は @etax/shared の normalizeTransactions が担う。
 */
import { z } from "@hono/zod-openapi";
import { DeductionInputsSchema, TaxCreditInputsSchema } from "./calc";
import { TaxYearSchema } from "./common";
import { TaxpayerProfileSchema } from "./taxpayer";

export const XtxTaxpayerSchema = z
  .object({
    name: z.string(),
    name_kana: z.string(),
    zip_code: z.string(),
    address: z.string(),
    address_line2: z.string(),
    birth_date: z.string(),
    phone: z.string(),
    tax_office_name: z.string(),
    tax_office_code: z.string(),
    my_number: z.string(),
    /** 利用者識別番号（e-Tax、16桁）。XTX の IT 部必須要素 NOZEISHA_ID 用。 */
    user_id: z.string(),
    occupation: z.string(),
    shop_name: z.string(),
    jan1_address: z.string(),
    /** インボイス登録番号。XTX には含まれず、プロフィールとして保持するだけ。 */
    invoice_number: z.string().optional(),
    /** 納税地の異動申出書用：異動・変更前の納税地。XTX には含まれない。 */
    previous_zip_code: z.string().optional(),
    previous_address: z.string().optional(),
  })
  .openapi("XtxTaxpayer");

export type XtxTaxpayerRequest = z.infer<typeof XtxTaxpayerSchema>;

/** 雑所得の入力（公的年金等・業務・その他）。帳簿に載らない所得を第一表へ反映する。 */
export const MiscIncomeSchema = z
  .object({
    revenue: z.number(),
    income: z.number(),
    kubun: z.number(),
    pensionRevenue: z.number().optional(),
    pensionOver65: z.boolean().optional(),
    businessRevenue: z.number().optional(),
    businessIncome: z.number().optional(),
    businessKubun: z.number().optional(),
  })
  .openapi("MiscIncome");

export type MiscIncomeRequest = z.infer<typeof MiscIncomeSchema>;

/** 給与所得の入力（収入金額と調整控除の対象可否。所得金額は控除を引いて計算する）。 */
export const SalaryIncomeSchema = z
  .object({
    revenue: z.number(),
    adjustmentEligible: z.boolean().optional(),
  })
  .openapi("SalaryIncome");

export type SalaryIncomeRequest = z.infer<typeof SalaryIncomeSchema>;

/** 一時所得の入力（ワイヤ形式、Issue #27 Phase A） */
export const TempIncomeWireSchema = z
  .object({
    revenue: z.number(),
    expenses: z.number(),
  })
  .openapi("TempIncomeWire");

/** 配当所得の入力（ワイヤ形式、Issue #27 Phase B）。listed_mode は上場配当等全体の課税方式。 */
export const DividendIncomeWireSchema = z
  .object({
    listed_revenue: z.number(),
    listed_trust_revenue: z.number(),
    listed_withholding: z.number(),
    listed_mode: z.enum(["comprehensive", "separate", "none"]),
    general_revenue: z.number(),
    general_trust_revenue: z.number(),
    general_withholding: z.number(),
    interest_expense: z.number(),
  })
  .openapi("DividendIncomeWire");

/** 株式等譲渡の区分（一般／上場）入力（ワイヤ形式、Issue #27 Phase C） */
export const StockTransferCategoryWireSchema = z
  .object({
    revenue: z.number(),
    other_revenue: z.number(),
    acquisition_cost: z.number(),
    transfer_fees: z.number(),
    other_expenses: z.number(),
  })
  .openapi("StockTransferCategoryWire");

/** 特定口座（源泉徴収口座）の明細行（ワイヤ形式、Issue #27 Phase C） */
export const SpecialAccountWireSchema = z
  .object({
    broker_name: z.string(),
    branch_name: z.string(),
    withholding_account: z.boolean(),
    revenue: z.number(),
    cost: z.number(),
    withholding: z.number(),
  })
  .openapi("SpecialAccountWire");

/** 株式等譲渡の入力（ワイヤ形式、Issue #27 Phase C） */
export const StockTransferWireSchema = z
  .object({
    general: StockTransferCategoryWireSchema,
    listed: StockTransferCategoryWireSchema,
    listed_withholding: z.number(),
    special_accounts: z.array(SpecialAccountWireSchema),
  })
  .openapi("StockTransferWire");

/** 拡張所得の入力（配当・一時・株式等譲渡、ワイヤ形式、Issue #27） */
export const ExpandedIncomeWireSchema = z
  .object({
    temp: TempIncomeWireSchema,
    dividend: DividendIncomeWireSchema,
    stocks: StockTransferWireSchema,
  })
  .openapi("ExpandedIncomeWire");

export type ExpandedIncomeWireRequest = z.infer<typeof ExpandedIncomeWireSchema>;

/** 農業所得の入力（ワイヤ形式、Issue #24） */
export const AgricultureWireSchema = z
  .object({
    farm_name: z.string(),
    sales_amount: z.number(),
    household_consumption: z.number(),
    misc_revenue: z.number(),
    produce_opening_inventory: z.number(),
    produce_closing_inventory: z.number(),
    other_opening_inventory: z.number(),
    other_closing_inventory: z.number(),
    /** 経費の科目別合計（科目名 → 金額、支出は正の金額） */
    expense_totals: z.record(z.string(), z.number()),
    family_worker_salary: z.number(),
    family_worker_deduction: z.number(),
    bad_debt_provision_in: z.number(),
    bad_debt_provision_back: z.number(),
    cultivation_cost_deduction: z.number(),
    beef_cattle_exemption_amount: z.number(),
  })
  .openapi("AgricultureWire");

export type AgricultureWireRequest = z.infer<typeof AgricultureWireSchema>;

/** 減価償却明細の元になる固定資産の入力（XTX出力用。台帳DBとは別に直接渡せる）。 */
export const XtxFixedAssetSchema = z
  .object({
    name: z.string(),
    quantity: z.string().optional(),
    income_type: z.enum(["business", "real_estate", "agriculture"]),
    acquisition_date: z.string(),
    service_start_date: z.string().optional(),
    cost: z.number(),
    useful_life_years: z.number(),
    method: z.enum(["straight_line", "declining_balance", "lump_sum", "small_special"]),
    business_ratio_percent: z.number(),
  })
  .openapi("XtxFixedAsset");

export type XtxFixedAssetRequest = z.infer<typeof XtxFixedAssetSchema>;

/** 貸借対照表（KOA210 4面）の入力。勘定キーは shared の BalanceSheetAccount と同じ。 */
export const BalanceSheetInputSchema = z
  .object({
    opening: z.record(z.string(), z.number()),
    closing: z.record(z.string(), z.number()),
    extra_asset: z
      .object({ name: z.string(), opening: z.number(), closing: z.number() })
      .optional(),
    extra_liability1: z
      .object({ name: z.string(), opening: z.number(), closing: z.number() })
      .optional(),
    extra_liability2: z
      .object({ name: z.string(), opening: z.number(), closing: z.number() })
      .optional(),
    owner_loan: z.number(),
    owner_borrowing: z.number(),
  })
  .openapi("BalanceSheetInput");

export type BalanceSheetInputRequest = z.infer<typeof BalanceSheetInputSchema>;

export const ExportXtxRequestSchema = z
  .object({
    year: TaxYearSchema,
    amendment: z.boolean(),
    submission_date: z.string(),
    taxpayer: XtxTaxpayerSchema,
    transactions: z.unknown().optional(),
    deductions: DeductionInputsSchema,
    tax_credits: TaxCreditInputsSchema,
    misc_income: MiscIncomeSchema.optional(),
    salary_income: SalaryIncomeSchema.optional(),
    /** 配当・一時・株式等譲渡の入力（Issue #27）。源泉徴収税額は拡張分を自動加算する */
    expanded_income: ExpandedIncomeWireSchema.optional(),
    /** 農業所得の入力（Issue #24）。農業様式（KOA240/KOA120）を添付する */
    agriculture: AgricultureWireSchema.optional(),
    filing_type: z.enum(["blue65", "blue55", "blue10", "white"]).optional(),
    real_estate_business_scale: z.boolean().optional(),
    withholding_tax: z.number(),
    prepaid_tax: z.number(),
    original_third_period_tax: z.number().nullable(),
    /** 固定資産台帳の資産。決算書・収支内訳書の減価償却明細に反映する */
    fixed_assets: z.array(XtxFixedAssetSchema).optional(),
    /** 貸借対照表の入力（事業所得分） */
    balance_sheet: BalanceSheetInputSchema.optional(),
  })
  .openapi("ExportXtxRequest");

export type ExportXtxRequest = z.infer<typeof ExportXtxRequestSchema>;

export const ExportXtxResponseSchema = z
  .object({
    filename: z.string(),
    xtx: z.string(),
    /**
     * 公式XSD検証を行えなかった場合の警告（未同梱・検証エンジン不在）。
     * 検証が通れば null。スキーマ違反の場合は生成自体を 400 で止める。
     */
    xsd_warning: z.string().nullable(),
  })
  .openapi("ExportXtxResponse");

export type ExportXtxResponse = z.infer<typeof ExportXtxResponseSchema>;

/** 申告書の紙イメージ PDF 出力のレスポンス。リクエストは XTX 出力と共通。 */
export const ExportReturnPdfResponseSchema = z
  .object({
    filename: z.string(),
    pdf_base64: z.string(),
  })
  .openapi("ExportReturnPdfResponse");

export type ExportReturnPdfResponse = z.infer<typeof ExportReturnPdfResponseSchema>;

/**
 * 納税地の異動又は変更に関する申出書（印刷用 PDF）の出力リクエスト。
 * 納税者情報はプロフィール形式（異動前の納税地を含む）で受ける。
 */
export const ExportDomicilePdfRequestSchema = z
  .object({
    year: z.number(),
    submission_date: z.string(),
    taxpayer: TaxpayerProfileSchema,
  })
  .openapi("ExportDomicilePdfRequest");

export type ExportDomicilePdfRequest = z.infer<typeof ExportDomicilePdfRequestSchema>;

export const ExportDomicilePdfResponseSchema = z
  .object({
    filename: z.string(),
    pdf_base64: z.string(),
  })
  .openapi("ExportDomicilePdfResponse");

export type ExportDomicilePdfResponse = z.infer<typeof ExportDomicilePdfResponseSchema>;

export const ExportConsumptionXtxRequestSchema = z
  .object({
    taxpayer: XtxTaxpayerSchema,
    period_from: z.string(),
    period_to: z.string(),
    submission_date: z.string(),
    filing_kind: z.union([z.literal(1), z.literal(3)]),
    base_period_sales_thousands: z.number(),
    sales_incl_10: z.number(),
    sales_incl_8: z.number(),
    nontaxable_sales: z.number(),
    exempt_sales: z.number(),
    purchases_incl_10: z.number(),
    purchases_incl_8: z.number(),
    interim_national: z.number(),
    interim_local: z.number(),
    original_national: z.number().nullable(),
    original_local: z.number().nullable(),
    /** 計算方式。省略時は本則（standard）。simplified は簡易課税（手続 RSH0030）、special20 は2割特例 */
    method: z.enum(["standard", "simplified", "special20"]).optional(),
    /**
     * 簡易課税: 売上の事業区分（1=卸売 2=小売 3=製造等 4=その他 5=サービス等 6=不動産）。
     * sales_by_category を渡さない場合、全売上をこの区分に寄せる。省略時は 5。
     */
    business_category: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
      .optional(),
    /** 簡易課税: 事業区分ごとの課税売上（税込）。キーは区分番号の文字列 */
    sales_by_category: z
      .record(
        z.enum(["1", "2", "3", "4", "5", "6"]),
        z.object({ incl_10: z.number(), incl_8: z.number() }),
      )
      .optional(),
    /** 簡易課税: 売上対価の返還等の金額（税込）・税率10%分 */
    returns_incl_10: z.number().optional(),
    /** 簡易課税: 売上対価の返還等の金額（税込）・軽減税率8%分 */
    returns_incl_8: z.number().optional(),
    /** 簡易課税: 貸倒回収に係る消費税額（税額）・税率10%分 */
    bad_debt_recovery_tax_10: z.number().optional(),
    /** 簡易課税: 貸倒回収に係る消費税額（税額）・軽減税率8%分 */
    bad_debt_recovery_tax_8: z.number().optional(),
    /** 簡易課税: 貸倒れに係る税額（税額）・税率10%分 */
    bad_debt_tax_10: z.number().optional(),
    /** 簡易課税: 貸倒れに係る税額（税額）・軽減税率8%分 */
    bad_debt_tax_8: z.number().optional(),
  })
  .openapi("ExportConsumptionXtxRequest");

export type ExportConsumptionXtxRequest = z.infer<typeof ExportConsumptionXtxRequestSchema>;

export const ExportConsumptionXtxResponseSchema = z
  .object({
    filename: z.string(),
    xtx: z.string(),
    total_payable: z.number(),
    /** 公式XSD検証を行えなかった場合の警告。検証が通れば null（ExportXtxResponse と同じ意味）。 */
    xsd_warning: z.string().nullable(),
  })
  .openapi("ExportConsumptionXtxResponse");

export type ExportConsumptionXtxResponse = z.infer<typeof ExportConsumptionXtxResponseSchema>;
