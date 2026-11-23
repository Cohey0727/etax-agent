/**
 * listFixedAssets.ts — 固定資産台帳の一覧ユースケース（usecases）。DB必須。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { fixedAssetToApi, listFixedAssetRows } from "../repositories/fixedAssetRepository";
import { ErrorSchema } from "../schemas/common";
import { FixedAssetListResponse, FixedAssetListResponseSchema } from "../schemas/fixedAsset";

export const listFixedAssetsRoute = createRoute({
  method: "get",
  path: "/api/fixed-assets",
  operationId: "listFixedAssets",
  tags: ["FixedAssets"],
  summary: "固定資産台帳の一覧（DB必須）",
  responses: {
    200: {
      content: { "application/json": { schema: FixedAssetListResponseSchema } },
      description: "固定資産の一覧",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const listFixedAssetsHandler: RouteHandler<typeof listFixedAssetsRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  let rows;
  try {
    rows = await listFixedAssetRows(db);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  const response: FixedAssetListResponse = { assets: rows.map(fixedAssetToApi) };
  return c.json(response, 200);
};
