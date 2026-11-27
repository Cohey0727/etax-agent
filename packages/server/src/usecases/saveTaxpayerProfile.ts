/**
 * saveTaxpayerProfile.ts — 納税者プロフィール保存ユースケース（usecases）。DB必須。
 *
 * ボディ検証はハンドラ側で行う: DB未設定時の 503 と year・ボディ不正の
 * 400 を従来順序で返すため（ルート定義にボディは置かない）。
 * 保存は対象年に対して行い、プロフィール全体を書き換える。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import {
  taxpayerProfileToApi,
  upsertTaxpayerProfileRow,
} from "../repositories/taxpayerRepository";
import { ErrorSchema } from "../schemas/common";
import {
  SaveTaxpayerProfileRequestSchema,
  SaveTaxpayerProfileResponse,
  SaveTaxpayerProfileResponseSchema,
  TaxpayerProfile,
  TaxpayerYearParamSchema,
} from "../schemas/taxpayer";

export const saveTaxpayerProfileRoute = createRoute({
  method: "put",
  path: "/api/taxpayer/{year}",
  operationId: "saveTaxpayerProfile",
  tags: ["Taxpayer"],
  summary: "納税者プロフィールを保存（DB必須）",
  request: { params: TaxpayerYearParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SaveTaxpayerProfileResponseSchema } },
      description: "保存された納税者プロフィール",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year またはボディが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const saveTaxpayerProfileHandler: RouteHandler<typeof saveTaxpayerProfileRoute> = async (
  c,
) => {
  const db = requireDb();
  const { year } = c.req.valid("param");
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = SaveTaxpayerProfileRequestSchema.safeParse(raw);
  if (!parsed.success) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const profile: TaxpayerProfile = {
    name: parsed.data.name ?? "",
    name_kana: parsed.data.name_kana ?? "",
    zip_code: parsed.data.zip_code ?? "",
    address: parsed.data.address ?? "",
    address_line2: parsed.data.address_line2 ?? "",
    birth_date: parsed.data.birth_date ?? "",
    phone: parsed.data.phone ?? "",
    tax_office_name: parsed.data.tax_office_name ?? "",
    tax_office_code: parsed.data.tax_office_code ?? "",
    my_number: parsed.data.my_number ?? "",
    user_id: parsed.data.user_id ?? "",
    occupation: parsed.data.occupation ?? "",
    shop_name: parsed.data.shop_name ?? "",
    jan1_address: parsed.data.jan1_address ?? "",
    invoice_number: parsed.data.invoice_number ?? "",
    previous_zip_code: parsed.data.previous_zip_code ?? "",
    previous_address: parsed.data.previous_address ?? "",
  };
  const row = await upsertTaxpayerProfileRow(db, year, profile);
  if (!row) throw new HTTPException(503, { message: "納税者プロフィールを保存できませんでした" });
  const response: SaveTaxpayerProfileResponse = { taxpayer: taxpayerProfileToApi(row) };
  return c.json(response, 200);
};
