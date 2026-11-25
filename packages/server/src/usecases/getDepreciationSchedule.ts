/**
 * getDepreciationSchedule.ts — 指定年の減価償却スケジュール（usecases）。DB必須。
 *
 * 台帳の全資産について対象年の償却を shared のエンジンで計算し、
 * 資産ごとの行と所得区分ごとの算入額合計、少額特例の上限使用状況を返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { depreciationForYear, smallSpecialUsage } from "@etax/shared";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import {
  fixedAssetToInput,
  isActiveInYear,
  listFixedAssetRows,
} from "../repositories/fixedAssetRepository";
import { ErrorSchema } from "../schemas/common";
import { DepreciationScheduleResponse, DepreciationScheduleResponseSchema } from "../schemas/fixedAsset";

const YearQuerySchema = z.object({ year: z.string() }).openapi("DepreciationYearQuery");

export const getDepreciationScheduleRoute = createRoute({
  method: "get",
  path: "/api/fixed-assets/depreciation",
  operationId: "getDepreciationSchedule",
  tags: ["FixedAssets"],
  summary: "指定年の減価償却スケジュール（DB必須）",
  request: { query: YearQuerySchema },
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
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const year = Number(c.req.query("year"));
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new HTTPException(400, { message: "year は西暦で指定してください" });
  }
  let rows;
  try {
    rows = await listFixedAssetRows(db);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const active = rows.filter((row) => isActiveInYear(row, year));
  const result: DepreciationScheduleResponse["rows"] = [];
  const totals = { business: 0, real_estate: 0, agriculture: 0 };
  for (const row of active) {
    const input = fixedAssetToInput(row);
    let dep;
    try {
      dep = depreciationForYear(input, year);
    } catch (e) {
      throw new HTTPException(400, {
        message: e instanceof Error ? e.message : "減価償却の計算に失敗しました",
      });
    }
    if (!dep) continue;
    result.push({
      asset_id: row.id,
      name: row.name,
      income_type: row.incomeType,
      year: dep.year,
      months: dep.months,
      opening_book_value: dep.openingBookValue,
      basis_amount: dep.basisAmount,
      rate: dep.rate,
      guarantee_amount: dep.guaranteeAmount,
      ordinary: dep.ordinary,
      deductible: dep.deductible,
      closing_book_value: dep.closingBookValue,
    });
    if (row.incomeType === "business") totals.business += dep.deductible;
    if (row.incomeType === "real_estate") totals.real_estate += dep.deductible;
    if (row.incomeType === "agriculture") totals.agriculture += dep.deductible;
  }
  const usage = smallSpecialUsage(active.map(fixedAssetToInput), year);
  const response: DepreciationScheduleResponse = {
    year,
    rows: result,
    deductible_totals: totals,
    small_special: usage,
  };
  return c.json(response, 200);
};
