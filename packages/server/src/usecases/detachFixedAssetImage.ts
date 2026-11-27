/**
 * detachFixedAssetImage.ts — 固定資産の画像を取り外すユースケース（usecases）。DB必須。
 *
 * 台帳の行とストレージの実体の両方を消す。実体の削除に失敗しても行の
 * 削除は成立させる（ぶら下がった実体は実害が小さいため）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createStorageClient, fixedAssetObjectKey } from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { requireDb } from "../lib/errors";
import { getFixedAssetRow } from "../repositories/fixedAssetRepository";
import { deleteFixedAssetImageRow } from "../repositories/fixedAssetImageRepository";
import { ErrorSchema, MessageResponseSchema } from "../schemas/common";
import { FixedAssetImageParamsSchema } from "../schemas/fixedAsset";

export const detachFixedAssetImageRoute = createRoute({
  method: "delete",
  path: "/api/fixed-assets/{id}/images/{fileId}",
  operationId: "detachFixedAssetImage",
  tags: ["FixedAssets"],
  summary: "固定資産の画像を取り外す（DB必須）",
  request: { params: FixedAssetImageParamsSchema },
  responses: {
    200: {
      content: { "application/json": { schema: MessageResponseSchema } },
      description: "取り外し完了",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "固定資産IDが不正",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の固定資産または画像が無い",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB未設定または接続不可",
    },
  },
});

export const detachFixedAssetImageHandler: RouteHandler<typeof detachFixedAssetImageRoute> = async (
  c,
) => {
  const db = requireDb();
  const { id, fileId } = c.req.valid("param");
  const asset = await getFixedAssetRow(db, id);
  if (!asset) {
    throw new HTTPException(404, { message: "対象の固定資産が見つかりません" });
  }
  const deleted = await deleteFixedAssetImageRow(db, id, fileId);
  if (!deleted) {
    throw new HTTPException(404, { message: "対象の画像が見つかりません" });
  }
  const storage = createStorageClient(loadStorageConfig());
  await storage.deleteObject(fixedAssetObjectKey(fileId)).catch(() => undefined);
  return c.json({ message: "画像を取り外しました" }, 200);
};
