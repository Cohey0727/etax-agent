/**
 * getTaxpayerProfile.ts — 納税者プロフィール取得ユースケース（usecases）。DB必須。
 *
 * 対象年の保存が無ければ直近の過去年のプロフィールを引き継ぎとして返し、
 * carried_from に引き継ぎ元の年を入れる。どちらも無ければ空のプロフィール。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  emptyTaxpayerProfile,
  findTaxpayerCarryRow,
  getTaxpayerProfileRow,
  taxpayerProfileToApi,
} from "../repositories/taxpayerRepository";
import { ErrorSchema } from "../schemas/common";
import {
  GetTaxpayerProfileResponse,
  GetTaxpayerProfileResponseSchema,
  TaxpayerYearParamSchema,
} from "../schemas/taxpayer";

export const getTaxpayerProfileRoute = createRoute({
  method: "get",
  path: "/api/taxpayer/{year}",
  operationId: "getTaxpayerProfile",
  tags: ["Taxpayer"],
  summary: "納税者プロフィールを取得（DB必須）",
  request: { params: TaxpayerYearParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: GetTaxpayerProfileResponseSchema } },
      description: "納税者プロフィール（無ければ過去年からの引き継ぎ）",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "year が不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const getTaxpayerProfileHandler: RouteHandler<typeof getTaxpayerProfileRoute> = async (
  c,
) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const { year } = c.req.valid("param");
  let response: GetTaxpayerProfileResponse;
  try {
    const own = await getTaxpayerProfileRow(db, year);
    if (own) {
      response = { taxpayer: taxpayerProfileToApi(own), carried_from: null };
    } else {
      const carry = await findTaxpayerCarryRow(db, year);
      response = carry
        ? { taxpayer: taxpayerProfileToApi(carry), carried_from: carry.year }
        : { taxpayer: emptyTaxpayerProfile(), carried_from: null };
    }
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  return c.json(response, 200);
};
