/**
 * deleteFixedAsset.ts — 固定資産の削除ユースケース（usecases）。DB必須。
 * 台帳からの完全な誤登録の削除用。除却・売却は disposed_date の更新で表す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { deleteFixedAssetRow } from "../repositories/fixedAssetRepository";
import { ErrorSchema } from "../schemas/common";
import { FixedAssetIdParamSchema, MessageResponseSchema } from "../schemas/fixedAsset";

export const deleteFixedAssetRoute = createRoute({
  method: "delete",
  path: "/api/fixed-assets/{id}",
  operationId: "deleteFixedAsset",
  tags: ["FixedAssets"],
  summary: "固定資産を削除（DB必須）",
  request: { params: FixedAssetIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: MessageResponseSchema } },
      description: "削除した",
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

export const deleteFixedAssetHandler: RouteHandler<typeof deleteFixedAssetRoute> = async (c) => {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HTTPException(404, { message: "固定資産が見つかりません" });
  }
  let deleted: boolean;
  try {
    deleted = await deleteFixedAssetRow(db, id);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  if (!deleted) throw new HTTPException(404, { message: "固定資産が見つかりません" });
  return c.json({ message: "削除しました" }, 200);
};
