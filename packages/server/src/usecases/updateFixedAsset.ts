/**
 * updateFixedAsset.ts — 固定資産の更新ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { requireDb } from "../lib/errors";
import { readJsonBody } from "../lib/readJsonBody";
import { fixedAssetToApi, updateFixedAssetRow } from "../repositories/fixedAssetRepository";
import { ErrorSchema } from "../schemas/common";
import {
  FixedAssetIdParamSchema,
  SingleFixedAssetResponse,
  SingleFixedAssetResponseSchema,
  UpdateFixedAssetRequestSchema,
} from "../schemas/fixedAsset";

export const updateFixedAssetRoute = createRoute({
  method: "put",
  path: "/api/fixed-assets/{id}",
  operationId: "updateFixedAsset",
  tags: ["FixedAssets"],
  summary: "固定資産を更新（DB必須）",
  request: { params: FixedAssetIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: SingleFixedAssetResponseSchema } },
      description: "更新された固定資産",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディが不正",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の固定資産が無い",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const updateFixedAssetHandler: RouteHandler<typeof updateFixedAssetRoute> = async (c) => {
  const db = requireDb();
  const { id } = c.req.valid("param");
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = UpdateFixedAssetRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "固定資産の入力が不正です" });
  }
  const body = parsed.data;
  const row = await updateFixedAssetRow(db, id, {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
    ...(body.income_type !== undefined ? { incomeType: body.income_type } : {}),
    ...(body.acquisition_date !== undefined ? { acquisitionDate: body.acquisition_date } : {}),
    ...(body.service_start_date !== undefined ? { serviceStartDate: body.service_start_date } : {}),
    ...(body.cost !== undefined ? { cost: body.cost } : {}),
    ...(body.useful_life_years !== undefined ? { usefulLifeYears: body.useful_life_years } : {}),
    ...(body.method !== undefined ? { method: body.method } : {}),
    ...(body.business_ratio_percent !== undefined
      ? { businessRatioPercent: body.business_ratio_percent }
      : {}),
    ...(body.disposed_date !== undefined ? { disposedDate: body.disposed_date } : {}),
  });
  if (!row) throw new HTTPException(404, { message: "固定資産が見つかりません" });
  const response: SingleFixedAssetResponse = { asset: fixedAssetToApi(row) };
  return c.json(response, 200);
};
