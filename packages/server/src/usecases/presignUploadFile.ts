/**
 * presignUploadFile.ts — アップロード受け口URLの発行ユースケース（usecases）。
 *
 * フロー: 画面が返された署名付きURLへ直接ファイルを送る（s3 ドライバでは
 * ストレージへ直行し、このサーバーは経由しない。local ドライバではこの
 * サーバーの PUT /api/files/content/<key> が受け口になる）→ 画面は
 * ファイルIDを解析依頼（/api/receipts/analyze）や固定資産への添付に渡す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  createStorageClient,
  fixedAssetObjectKey,
  receiptObjectKey,
  StorageError,
} from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { ErrorSchema } from "../schemas/common";
import {
  PresignUploadFileRequestSchema,
  PresignUploadFileResponseSchema,
} from "../schemas/file";

const UPLOAD_URL_EXPIRES_IN_SECONDS = 600;

export const presignUploadFileRoute = createRoute({
  method: "post",
  path: "/api/files/presign-upload",
  operationId: "presignUploadFile",
  tags: ["Files"],
  summary: "ファイル直アップロード用の署名付きURLを発行",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: PresignUploadFileRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: PresignUploadFileResponseSchema } },
      description: "ファイルIDと署名付きアップロードURL",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "JSONボディが不正",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ストレージ未設定・URL発行失敗",
    },
  },
});

export const presignUploadFileHandler: RouteHandler<typeof presignUploadFileRoute> = async (c) => {
  const body = c.req.valid("json");
  const fileId = crypto.randomUUID();
  const key =
    body.purpose === "fixed_asset" ? fixedAssetObjectKey(fileId) : receiptObjectKey(fileId);
  try {
    const storage = createStorageClient(loadStorageConfig());
    const uploadUrl = await storage.presignUpload(key, body.contentType, UPLOAD_URL_EXPIRES_IN_SECONDS);
    return c.json({ fileId, uploadUrl, expiresInSeconds: UPLOAD_URL_EXPIRES_IN_SECONDS }, 200);
  } catch (e) {
    if (e instanceof StorageError) {
      throw new HTTPException(503, { message: e.message });
    }
    throw e;
  }
};
