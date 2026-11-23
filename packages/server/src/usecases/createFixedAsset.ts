/**
 * createFixedAsset.ts — 固定資産の登録ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { fixedAssetToApi, insertFixedAssetRow } from "../repositories/fixedAssetRepository";
import { ErrorSchema } from "../schemas/common";
import {
  CreateFixedAssetRequestSchema,
  SingleFixedAssetResponse,
  SingleFixedAssetResponseSchema,
} from "../schemas/fixedAsset";

export const createFixedAssetRoute = createRoute({
  method: "post",
  path: "/api/fixed-assets",
  operationId: "createFixedAsset",
  tags: ["FixedAssets"],
  summary: "固定資産を登録（DB必須）",
  responses: {
    201: {
      content: { "application/json": { schema: SingleFixedAssetResponseSchema } },
      description: "登録された固定資産",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const createFixedAssetHandler: RouteHandler<typeof createFixedAssetRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = CreateFixedAssetRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "固定資産の入力が不正です" });
  }
  const body = parsed.data;
  let row;
  try {
    row = await insertFixedAssetRow(db, {
      name: body.name,
      quantity: body.quantity ?? "",
      incomeType: body.income_type ?? "business",
      acquisitionDate: body.acquisition_date,
      serviceStartDate: body.service_start_date ?? null,
      cost: body.cost,
      usefulLifeYears: body.useful_life_years,
      method: body.method ?? "straight_line",
      businessRatioPercent: body.business_ratio_percent ?? 100,
      disposedDate: body.disposed_date ?? null,
    });
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: SingleFixedAssetResponse = { asset: row ? fixedAssetToApi(row) : null };
  return c.json(response, 201);
};
