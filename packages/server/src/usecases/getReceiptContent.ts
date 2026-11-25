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
import { getDb } from "../lib/db";
import { currentUserId } from "../lib/tenantContext";
import { servedContentType } from "../lib/uploadTypes";
import { getReceiptRowByFileId } from "../repositories/receiptRepository";
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
  // テナント文脈がある場合（SaaS）は、証憑台帳で所有者を確認できた
  // ファイルだけを配信する。他テナントの証憑・台帳に無いファイルは
  // 存在しないものとして 404 にする（画像の IDOR を塞ぐ）。
  // 文脈が無いローカル運用では従来どおり配信する。
  if (currentUserId() !== undefined) {
    const db = getDb();
    const row = db ? await getReceiptRowByFileId(db, fileId) : null;
    if (!row) throw new HTTPException(404, { message: "ファイルが存在しません" });
  }
  try {
    const storage = createStorageClient(loadStorageConfig());
    const downloaded = await storage.download(receiptObjectKey(fileId));
    const bytes = Buffer.from(downloaded.dataBase64, "base64");
    // 配信タイプはホワイトリストで検証し、nosniff と CSP sandbox で
    // ブラウザ側の解釈を封じる（Stored XSS 対策、Issue #7）。
    return c.body(bytes, 200, {
      "Content-Type": servedContentType(downloaded.mimeType),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    });
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
