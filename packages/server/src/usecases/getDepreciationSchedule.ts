/**
 * getDepreciationSchedule.ts — 指定年の減価償却スケジュール（usecases）。DB必須。
 *
 * 台帳の全資産について対象年の償却を shared のエンジンで計算し、
 * 資産ごとの行と所得区分ごとの算入額合計、少額特例の上限使用状況を返す
 * （組み立ては services/fixedAssets/buildDepreciationSchedule。MCP と共用）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { requireDb } from "../lib/errors";
import { listFixedAssetRows } from "../repositories/fixedAssetRepository";
import { ErrorSchema } from "../schemas/common";
import {
  DepreciationScheduleResponse,
  DepreciationScheduleResponseSchema,
  DepreciationYearQuerySchema,
} from "../schemas/fixedAsset";
import { buildDepreciationSchedule } from "../services/fixedAssets/buildDepreciationSchedule";

export const getDepreciationScheduleRoute = createRoute({
  method: "get",
  path: "/api/fixed-assets/depreciation",
  operationId: "getDepreciationSchedule",
  tags: ["FixedAssets"],
  summary: "指定年の減価償却スケジュール（DB必須）",
  request: { query: DepreciationYearQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: DepreciationScheduleResponseSchema } },
      description: "資産ごとの償却行と合計",
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

export const getDepreciationScheduleHandler: RouteHandler<
  typeof getDepreciationScheduleRoute
> = async (c) => {
  const db = requireDb();
  const { year } = c.req.valid("query");
  const response: DepreciationScheduleResponse = buildDepreciationSchedule(
    await listFixedAssetRows(db),
    year,
  );
  return c.json(response, 200);
};
