/**
 * presignUploadFile.ts — アップロード用署名付きURLの発行ユースケース（usecases）。
 *
 * フロー: 画面がこのURLへ直接ファイルを PUT する → 画面はファイルIDを
 * 解析依頼（/api/receipts/analyze）に渡す → サーバーがストレージから取得する。
 * ファイル実体はこのサーバーを経由しない。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createStorageClient, receiptObjectKey, StorageError } from "../gateways/storageGateway";
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
  const storageConfig = loadStorageConfig();
  if (!storageConfig.configured) {
    throw new HTTPException(503, {
      message: "ファイルストレージ（Garage）が設定されていないため、アップロードできません",
    });
  }
  const fileId = crypto.randomUUID();
  try {
    const storage = createStorageClient(storageConfig);
    const uploadUrl = await storage.presignUpload(
      receiptObjectKey(fileId),
      body.contentType,
      UPLOAD_URL_EXPIRES_IN_SECONDS,
    );
    return c.json({ fileId, uploadUrl, expiresInSeconds: UPLOAD_URL_EXPIRES_IN_SECONDS }, 200);
  } catch (e) {
    if (e instanceof StorageError) {
      throw new HTTPException(503, { message: e.message });
    }
    throw e;
  }
};
