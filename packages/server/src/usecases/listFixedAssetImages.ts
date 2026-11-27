/**
 * listFixedAssetImages.ts — 固定資産の画像一覧ユースケース（usecases）。DB必須。
 *
 * 各画像には表示用URL（s3 では署名付きURL、local では配信エンドポイント）
 * を付けて返す。ブラウザはそのURLへ直接取りに行く。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createStorageClient } from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { requireDb } from "../lib/errors";
import { fixedAssetImageDisplayUrl } from "../lib/fixedAssetImageUrl";
import { getFixedAssetRow } from "../repositories/fixedAssetRepository";
import {
  fixedAssetImageToApi,
  listFixedAssetImageRows,
} from "../repositories/fixedAssetImageRepository";
import { ErrorSchema } from "../schemas/common";
import {
  FixedAssetIdParamSchema,
  FixedAssetImageListResponse,
  FixedAssetImageListResponseSchema,
} from "../schemas/fixedAsset";

export const listFixedAssetImagesRoute = createRoute({
  method: "get",
  path: "/api/fixed-assets/{id}/images",
  operationId: "listFixedAssetImages",
  tags: ["FixedAssets"],
  summary: "固定資産の画像一覧（DB必須）",
  request: { params: FixedAssetIdParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: FixedAssetImageListResponseSchema } },
      description: "画像一覧（表示用URLつき）",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "固定資産IDが不正",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の固定資産が無い",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB/ストレージ未設定または接続不可",
    },
  },
});

export const listFixedAssetImagesHandler: RouteHandler<typeof listFixedAssetImagesRoute> = async (
  c,
) => {
  const db = requireDb();
  const { id } = c.req.valid("param");
  const storage = createStorageClient(loadStorageConfig());
  const asset = await getFixedAssetRow(db, id);
  if (!asset) {
    throw new HTTPException(404, { message: "対象の固定資産が見つかりません" });
  }
  const rows = await listFixedAssetImageRows(db, id);
  const images = [];
  for (const row of rows) {
    images.push(fixedAssetImageToApi(row, await fixedAssetImageDisplayUrl(storage, row.fileId)));
  }
  const response: FixedAssetImageListResponse = { images };
  return c.json(response, 200);
};
