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

/** 雑所得（その他）の入力。帳簿に載らない所得を第一表ク・⑨へ反映する。 */
export const MiscIncomeSchema = z
  .object({
    revenue: z.number(),
    income: z.number(),
    kubun: z.number(),
  })
  .openapi("MiscIncome");

export type MiscIncomeRequest = z.infer<typeof MiscIncomeSchema>;

/** 給与所得の入力（収入金額のみ。所得金額は給与所得控除で計算する）。 */
export const SalaryIncomeSchema = z
  .object({
    revenue: z.number(),
  })
  .openapi("SalaryIncome");

export type SalaryIncomeRequest = z.infer<typeof SalaryIncomeSchema>;

/** 減価償却明細の元になる固定資産の入力（XTX出力用。台帳DBとは別に直接渡せる）。 */
export const XtxFixedAssetSchema = z
  .object({
    name: z.string(),
    quantity: z.string().optional(),
    income_type: z.enum(["business", "real_estate"]),
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
    year: z.number(),
    amendment: z.boolean(),
    submission_date: z.string(),
    taxpayer: XtxTaxpayerSchema,
    transactions: z.unknown().optional(),
    deductions: DeductionInputsSchema,
    tax_credits: TaxCreditInputsSchema,
    misc_income: MiscIncomeSchema.optional(),
    salary_income: SalaryIncomeSchema.optional(),
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
  })
  .openapi("ExportConsumptionXtxResponse");

export type ExportConsumptionXtxResponse = z.infer<typeof ExportConsumptionXtxResponseSchema>;
