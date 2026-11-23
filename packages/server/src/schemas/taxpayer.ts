/**
 * taxpayer.ts — 納税者プロフィールエンドポイントのスキーマ（schemas）。
 *
 * プロフィールは年度ごとにDBへ保存する。ワイヤ形式はXTX出力の納税者情報と
 * 同じ snake_case で、インボイス登録番号まで含む（XTXには含めない項目も
 * プロフィールとしては保持する）。
 */
import { z } from "@hono/zod-openapi";

export const TaxpayerProfileSchema = z
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
    invoice_number: z.string(),
    /** 納税地の異動申出書用：異動・変更前の納税地。 */
    previous_zip_code: z.string(),
    previous_address: z.string(),
  })
  .openapi("TaxpayerProfile");

export type TaxpayerProfile = z.infer<typeof TaxpayerProfileSchema>;

/** 保存リクエスト: 欠けた項目は空文字として扱う（部分的な送信を許す）。 */
export const SaveTaxpayerProfileRequestSchema = TaxpayerProfileSchema.partial().openapi(
  "SaveTaxpayerProfileRequest",
);

export type SaveTaxpayerProfileRequest = z.infer<typeof SaveTaxpayerProfileRequestSchema>;

export const GetTaxpayerProfileResponseSchema = z
  .object({
    taxpayer: TaxpayerProfileSchema,
    /** 引き継ぎ元の年。対象年自身の保存を読んだ場合と未保存の場合は null。 */
    carried_from: z.number().nullable(),
  })
  .openapi("TaxpayerProfileResult");

export type GetTaxpayerProfileResponse = z.infer<typeof GetTaxpayerProfileResponseSchema>;

export const SaveTaxpayerProfileResponseSchema = z
  .object({
    taxpayer: TaxpayerProfileSchema,
  })
  .openapi("SaveTaxpayerProfileResult");

export type SaveTaxpayerProfileResponse = z.infer<typeof SaveTaxpayerProfileResponseSchema>;

export const TaxpayerYearParamSchema = z
  .object({
    year: z.string(),
  })
  .openapi("TaxpayerYearParam");
