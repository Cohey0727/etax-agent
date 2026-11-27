/**
 * deleteFixedAsset.ts — 固定資産の削除ユースケース（usecases）。DB必須。
 * 台帳からの完全な誤登録の削除用。除却・売却は disposed_date の更新で表す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createStorageClient, fixedAssetObjectKey } from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { getDb } from "../lib/db";
import { databaseConnectionErrorMessage, databaseUnavailableMessage } from "../lib/errors";
import { deleteFixedAssetRow } from "../repositories/fixedAssetRepository";
import { listFixedAssetImageRows } from "../repositories/fixedAssetImageRepository";
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
  const { id } = c.req.valid("param");
  let imageFileIds: string[];
  let deleted: boolean;
  try {
    // 添付画像の実体も消すため、行が消える前にファイルIDを控える
    // （画像行は FK の cascade で一緒に消える）。
    const images = await listFixedAssetImageRows(db, id);
    imageFileIds = images.map((image) => image.fileId);
    deleted = await deleteFixedAssetRow(db, id);
  } catch (e) {
    throw new HTTPException(503, { message: databaseConnectionErrorMessage(e) });
  }
  if (!deleted) throw new HTTPException(404, { message: "固定資産が見つかりません" });
  const storage = createStorageClient(loadStorageConfig());
  for (const fileId of imageFileIds) {
    await storage.deleteObject(fixedAssetObjectKey(fileId)).catch(() => undefined);
  }
  return c.json({ message: "削除しました" }, 200);
};
