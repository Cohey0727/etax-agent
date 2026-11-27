/**
 * getFixedAssetImageContent.ts — 固定資産画像の取得ユースケース（usecases）。
 *
 * local ドライバ用（署名付きURLが無い場合の表示経路）。s3 ドライバでは
 * 画面は署名付きURLでストレージから直接取得するため、この経路は使わない。
 * 配信の保護（所有者確認・タイプのホワイトリスト・nosniff・CSP sandbox）
 * は証憑の配信（getReceiptContent）と同じ方針。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { createStorageClient, fixedAssetObjectKey } from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import { getDb } from "../lib/db";
import { currentUserId } from "../lib/tenantContext";
import { servedContentType } from "../lib/uploadTypes";
import { getFixedAssetImageRowByFileId } from "../repositories/fixedAssetImageRepository";
import { ErrorSchema } from "../schemas/common";
import { FixedAssetImageFileIdParamSchema } from "../schemas/fixedAsset";

export const getFixedAssetImageContentRoute = createRoute({
  method: "get",
  path: "/api/fixed-assets/images/{fileId}/content",
  operationId: "getFixedAssetImageContent",
  tags: ["FixedAssets"],
  summary: "固定資産画像の取得（localドライバ用）",
  request: { params: FixedAssetImageFileIdParamSchema },
  responses: {
    200: { description: "固定資産画像" },
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

export const getFixedAssetImageContentHandler: RouteHandler<
  typeof getFixedAssetImageContentRoute
> = async (c) => {
  const { fileId } = c.req.valid("param");
  // テナント文脈がある場合は、台帳で所有者を確認できたファイルだけを
  // 配信する（画像の IDOR を塞ぐ）。文脈が無いローカル運用では従来どおり。
  if (currentUserId() !== undefined) {
    const db = getDb();
    const row = db ? await getFixedAssetImageRowByFileId(db, fileId) : null;
    if (!row) throw new HTTPException(404, { message: "ファイルが存在しません" });
  }
  const storage = createStorageClient(loadStorageConfig());
  const downloaded = await storage.download(fixedAssetObjectKey(fileId));
  const bytes = Buffer.from(downloaded.dataBase64, "base64");
  // 配信タイプはホワイトリストで検証し、nosniff と CSP sandbox で
  // ブラウザ側の解釈を封じる（Stored XSS 対策、Issue #7）。
  return c.body(bytes, 200, {
    "Content-Type": servedContentType(downloaded.mimeType),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
  });
};
