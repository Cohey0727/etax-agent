/**
 * getReceiptContent.ts — 証憑画像の取得ユースケース（usecases）。
 * 管理画面のサムネイル表示用に、ストレージから画像をそのまま返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  createStorageClient,
  receiptObjectKey,
  StorageError,
  StorageObjectNotFoundError,
} from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { ErrorSchema } from "../schemas/common";
import { ReceiptFileIdParamSchema } from "../schemas/receipt";

export const getReceiptContentRoute = createRoute({
  method: "get",
  path: "/api/receipts/{fileId}/content",
  operationId: "getReceiptContent",
  tags: ["Receipts"],
  summary: "証憑画像の取得",
  request: { params: ReceiptFileIdParamSchema },
  responses: {
    200: { description: "証憑画像" },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ファイルが存在しない",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "ストレージ未設定・取得失敗",
    },
  },
});

export const getReceiptContentHandler: RouteHandler<typeof getReceiptContentRoute> = async (c) => {
  const fileId = c.req.param("fileId");
  try {
    const storage = createStorageClient(loadStorageConfig());
    const downloaded = await storage.download(receiptObjectKey(fileId));
    const bytes = Buffer.from(downloaded.dataBase64, "base64");
    return c.body(bytes, 200, { "Content-Type": downloaded.mimeType });
  } catch (e) {
    if (e instanceof StorageObjectNotFoundError) {
      throw new HTTPException(404, { message: e.message });
    }
    if (e instanceof StorageError) {
      throw new HTTPException(503, { message: e.message });
    }
    throw e;
  }
};
