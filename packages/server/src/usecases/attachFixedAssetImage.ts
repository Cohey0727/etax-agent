/**
 * attachFixedAssetImage.ts — 固定資産への画像添付ユースケース（usecases）。DB必須。
 *
 * 画像の実体は署名付きURLでブラウザからストレージへ直接アップロード済み。
 * ここでは実在を HEAD で確認してから台帳へ登録する（クライアントの申告を
 * 信じない）。形式が画像でない場合はオブジェクトごと弾く。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createStorageClient, fixedAssetObjectKey } from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { requireDb } from "../lib/errors";
import { fixedAssetImageDisplayUrl } from "../lib/fixedAssetImageUrl";
import { readJsonBody } from "../lib/readJsonBody";
import {
  isAllowedUploadContentType,
  MAX_UPLOAD_BYTES,
  normalizeContentType,
  UPLOAD_TOO_LARGE_MESSAGE,
} from "../lib/uploadTypes";
import { getFixedAssetRow } from "../repositories/fixedAssetRepository";
import {
  fixedAssetImageToApi,
  getFixedAssetImageRowByFileId,
  insertFixedAssetImageRow,
} from "../repositories/fixedAssetImageRepository";
import { ErrorSchema } from "../schemas/common";
import {
  AttachFixedAssetImageRequestSchema,
  FixedAssetIdParamSchema,
  SingleFixedAssetImageResponse,
  SingleFixedAssetImageResponseSchema,
} from "../schemas/fixedAsset";

export const attachFixedAssetImageRoute = createRoute({
  method: "post",
  path: "/api/fixed-assets/{id}/images",
  operationId: "attachFixedAssetImage",
  tags: ["FixedAssets"],
  summary: "固定資産へ画像を添付（DB必須）",
  request: { params: FixedAssetIdParamSchema },
  responses: {
    201: {
      content: { "application/json": { schema: SingleFixedAssetImageResponseSchema } },
      description: "添付された画像",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ボディが不正・アップロード未確認・画像以外の形式",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "対象の固定資産が無い",
    },
    409: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "同じファイルが添付済み",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "DB/ストレージ未設定または接続不可",
    },
  },
});

export const attachFixedAssetImageHandler: RouteHandler<typeof attachFixedAssetImageRoute> = async (
  c,
) => {
  const db = requireDb();
  const { id } = c.req.valid("param");
  const raw = await readJsonBody(c);
  if (!raw) throw new HTTPException(400, { message: "JSONボディが必要です" });
  const parsed = AttachFixedAssetImageRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "file_id が不正です" });
  }
  const fileId = parsed.data.file_id;
  const storage = createStorageClient(loadStorageConfig());
  const asset = await getFixedAssetRow(db, id);
  if (!asset) {
    throw new HTTPException(404, { message: "対象の固定資産が見つかりません" });
  }
  const existing = await getFixedAssetImageRowByFileId(db, fileId);
  if (existing) {
    throw new HTTPException(409, { message: "この画像は添付済みです" });
  }
  // 実体がストレージにあることを確認してから登録する。
  const head = await storage.head(fixedAssetObjectKey(fileId));
  if (!head) {
    throw new HTTPException(400, { message: "アップロードされた画像が確認できません" });
  }
  if (head.size > MAX_UPLOAD_BYTES) {
    await storage.deleteObject(fixedAssetObjectKey(fileId)).catch(() => undefined);
    throw new HTTPException(400, { message: UPLOAD_TOO_LARGE_MESSAGE });
  }
  const mimeType = normalizeContentType(head.contentType);
  if (!isAllowedUploadContentType(mimeType)) {
    await storage.deleteObject(fixedAssetObjectKey(fileId)).catch(() => undefined);
    throw new HTTPException(400, { message: "対応していないファイル形式です（画像のみ添付できます）" });
  }
  const row = await insertFixedAssetImageRow(db, { assetId: id, fileId, mimeType });
  const url = await fixedAssetImageDisplayUrl(storage, fileId);
  const response: SingleFixedAssetImageResponse = {
    image: row ? fixedAssetImageToApi(row, url) : null,
  };
  return c.json(response, 201);
};
