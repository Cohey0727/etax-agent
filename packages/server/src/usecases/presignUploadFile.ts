/**
 * presignUploadFile.ts — アップロード受け口URLの発行ユースケース（usecases）。
 *
 * フロー: 画面が返された署名付きURLへ直接ファイルを送る（s3 ドライバでは
 * ストレージへ直行し、このサーバーは経由しない。local ドライバではこの
 * サーバーの PUT /api/files/content/<key> が受け口になる）→ 画面は
 * ファイルIDを解析依頼（/api/receipts/analyze）、固定資産への添付、
 * 受信通知PDFの添付（purpose=filing_receipt）に渡す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  createStorageClient,
  filingReceiptObjectKey,
  fixedAssetObjectKey,
  receiptObjectKey,
} from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { isAllowedDocumentContentType, isAllowedUploadContentType } from "../lib/uploadTypes";
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
  // 用途と形式の組み合わせを固定する: PDF は受信通知専用、画像は
  // 領収書・固定資産専用（取り違えると添付時の検証で弾かれる）。
  if (body.purpose === "filing_receipt") {
    if (!isAllowedDocumentContentType(body.contentType)) {
      throw new HTTPException(400, {
        message: "受信通知のアップロードは PDF（application/pdf）のみ対応しています",
      });
    }
  } else if (!isAllowedUploadContentType(body.contentType)) {
    throw new HTTPException(400, {
      message: "対応していないファイル形式です（画像のみアップロードできます）",
    });
  }
  const fileId = crypto.randomUUID();
  const key =
    body.purpose === "fixed_asset"
      ? fixedAssetObjectKey(fileId)
      : body.purpose === "filing_receipt"
        ? filingReceiptObjectKey(fileId)
        : receiptObjectKey(fileId);
  const storage = createStorageClient(loadStorageConfig());
  const uploadUrl = await storage.presignUpload(key, body.contentType, UPLOAD_URL_EXPIRES_IN_SECONDS);
  return c.json({ fileId, uploadUrl, expiresInSeconds: UPLOAD_URL_EXPIRES_IN_SECONDS }, 200);
};
