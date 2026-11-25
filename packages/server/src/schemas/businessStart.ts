/**
 * businessStart.ts — 開業届・青色申告承認申請書の専用入力のスキーマ（schemas）。
 *
 * 開業は一度きりの手続きで年度に属さないため、保存は申告入力
 * （filing_inputs、年度別）には相乗りさせず、所有者ごとの専用保存
 * （business_start_inputs）を持つ。プロフィール（TaxpayerProfile）は
 * XTX ワイヤ互換の平坦な文字列スキーマで、真偽値・配列・日付を持つ
 * この入力には合わないことも理由。形はここで検証してから保存する。
 */
import { z } from "@hono/zod-openapi";
import { TaxpayerProfileSchema } from "./taxpayer";

/** 所得の種類（両様式共通の選択肢）。 */
export const BusinessStartIncomeTypeSchema = z.enum(["real_estate", "forest", "business"]);
export type BusinessStartIncomeType = z.infer<typeof BusinessStartIncomeTypeSchema>;

/** 青色申告承認申請書 6(1) の簿記方式。 */
export const BookkeepingMethodSchema = z.enum(["double", "simple", "other"]);
export type BookkeepingMethod = z.infer<typeof BookkeepingMethodSchema>;

/** 給与等の支払の状況の1行（専従者・使用人・その他）。 */
export const SalarySituationRowSchema = z
  .object({
    /** 従事員数。未入力は null。 */
    count: z.number().int().min(0).nullable(),
    /** 給与の定め方（日給・月給など）。 */
    terms: z.string(),
    /** 税額の有無。未選択は null。 */
    has_tax: z.boolean().nullable(),
  })
  .openapi("SalarySituationRow");
export type SalarySituationRow = z.infer<typeof SalarySituationRowSchema>;

/** 開業届・青色申告承認申請書の専用入力（プロフィールに無い項目）。 */
export const BusinessStartInputsSchema = z
  .object({
    /** 開業日（事業開始等の日、YYYY-MM-DD）。未入力は空文字。 */
    start_date: z.string(),
    /** 事業の概要（開業届）。 */
    business_overview: z.string(),
    /** 所得の種類。 */
    income_types: z.array(BusinessStartIncomeTypeSchema),
    /** 開業届: 「青色申告承認申請書」の提出の有無。 */
    submits_blue_application: z.boolean(),
    /** 開業届: 消費税に関する「課税事業者選択届出書」の提出の有無。 */
    submits_consumption_election: z.boolean(),
    /** 納税地以外の住所地・事業所等（両様式）。 */
    other_zip_code: z.string(),
    other_address: z.string(),
    other_phone: z.string(),
    /** 青色申告を開始する年分（申請書の「◯年分以後」）。0 は未入力（開業年を使う）。 */
    blue_start_year: z.number().int().min(0),
    /** 青色申告承認申請書 1: 事業所又は所得の基因となる資産（最大2件）。 */
    offices: z
      .array(z.object({ name: z.string(), location: z.string() }))
      .max(2),
    /** 青色申告承認申請書 3: 青色申告承認の取消し・取りやめの有無。 */
    blue_cancellation_has: z.boolean().nullable(),
    blue_cancellation_date: z.string(),
    /** 青色申告承認申請書 5: 相続による事業承継の有無。 */
    inheritance_has: z.boolean().nullable(),
    inheritance_date: z.string(),
    predecessor_name: z.string(),
    /** 青色申告承認申請書 6(1): 簿記方式。未選択は null。 */
    bookkeeping: BookkeepingMethodSchema.nullable(),
    bookkeeping_other: z.string(),
    /** 青色申告承認申請書 6(2): 備付帳簿名（BLUE_BOOK_OPTIONS のキー）。 */
    books: z.array(z.string()),
    /** 青色申告承認申請書 6(3): その他。 */
    blue_other_notes: z.string(),
    /** 開業届: 給与等の支払の状況。 */
    salary_family: SalarySituationRowSchema,
    salary_employee: SalarySituationRowSchema,
    /** 3行目の区分名（自由記入）。 */
    salary_other_label: z.string(),
    salary_other: SalarySituationRowSchema,
    /** 開業届: 源泉所得税の納期の特例の承認に関する申請書の提出の有無。 */
    withholding_special: z.boolean().nullable(),
    /** 開業届: 給与支払を開始する年月日。 */
    salary_start_date: z.string(),
    /** 開業届: その他参考事項。 */
    other_notes: z.string(),
  })
  .openapi("BusinessStartInputs");
export type BusinessStartInputs = z.infer<typeof BusinessStartInputsSchema>;

export const BusinessStartInputsResponseSchema = z
  .object({
    /** 保存済みの専用入力。未保存なら null。 */
    state: BusinessStartInputsSchema.nullable(),
    updated_at: z.string().nullable(),
  })
  .openapi("BusinessStartInputsResponse");
export type BusinessStartInputsResponse = z.infer<
  typeof BusinessStartInputsResponseSchema
>;

export const SaveBusinessStartInputsRequestSchema = z
  .object({
    state: BusinessStartInputsSchema,
  })
  .openapi("SaveBusinessStartInputsRequest");
export type SaveBusinessStartInputsRequest = z.infer<
  typeof SaveBusinessStartInputsRequestSchema
>;

/** 開業届・青色申告承認申請書 PDF 出力のリクエスト（プロフィール＋専用入力）。 */
export const ExportBusinessStartPdfRequestSchema = z
  .object({
    submission_date: z.string(),
    taxpayer: TaxpayerProfileSchema,
    inputs: BusinessStartInputsSchema,
  })
  .openapi("ExportBusinessStartPdfRequest");
export type ExportBusinessStartPdfRequest = z.infer<
  typeof ExportBusinessStartPdfRequestSchema
>;

export const ExportBusinessStartPdfResponseSchema = z
  .object({
    filename: z.string(),
    pdf_base64: z.string(),
  })
  .openapi("ExportBusinessStartPdfResponse");
export type ExportBusinessStartPdfResponse = z.infer<
  typeof ExportBusinessStartPdfResponseSchema
>;
