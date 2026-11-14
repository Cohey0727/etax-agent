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
    occupation: z.string(),
    shop_name: z.string(),
    jan1_address: z.string(),
  })
  .openapi("XtxTaxpayer");

export type XtxTaxpayerRequest = z.infer<typeof XtxTaxpayerSchema>;

export const ExportXtxRequestSchema = z
  .object({
    year: z.number(),
    amendment: z.boolean(),
    submission_date: z.string(),
    taxpayer: XtxTaxpayerSchema,
    transactions: z.unknown().optional(),
    deductions: DeductionInputsSchema,
    tax_credits: TaxCreditInputsSchema,
    withholding_tax: z.number(),
    prepaid_tax: z.number(),
    original_third_period_tax: z.number().nullable(),
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
