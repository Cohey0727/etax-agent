/**
 * uploadFileContent.ts — アップロード実体の受け口（usecases）。
 *
 * presignUploadFile が返したURL（PUT /api/files/content/<key>）へ
 * ブラウザがファイル実体を送ってくる。ここでローカルフォルダへ保存し、
 * 以後はファイルID（キー）で /api/receipts/analyze から参照される。
 * ボディはバイナリのため、通常の Hono ハンドラとして実装する
 * （zod-openapi の対象外）。
 */
import { Context } from "hono";
import { createStorageClient, StorageError } from "../gateways/storageGateway";
import { loadStorageConfig } from "../lib/config";
import {
  isAllowedDocumentContentType,
  isAllowedUploadContentType,
  normalizeContentType,
} from "../lib/uploadTypes";

const CONTENT_PATH_PREFIX = "/api/files/content/";

/** 受信通知PDFのキー接頭辞。この配下だけ文書形式（PDF）を許可する。 */
const FILING_RECEIPTS_PREFIX = "filing-receipts/";

export const uploadFileContentHandler = async (c: Context) => {
  const key = c.req.path.slice(CONTENT_PATH_PREFIX.length);
  if (!key) {
    return c.json({ error: "ファイルキーが指定されていません" }, 400);
  }
  // 実際に送られた Content-Type を検証する。presign の申告だけを信じると、
  // 画像と偽って HTML を置き、自オリジン配信で Stored XSS になる（Issue #7）。
  // PDF は受信通知のキー配下に限って許可する（他の配下では画像のみ）。
  const contentType = normalizeContentType(c.req.header("content-type"));
  const allowed =
    isAllowedUploadContentType(contentType) ||
    (key.startsWith(FILING_RECEIPTS_PREFIX) && isAllowedDocumentContentType(contentType));
  if (!allowed) {
    return c.json({ error: "対応していないファイル形式です（画像のみアップロードできます）" }, 400);
  }
  try {
    const storage = createStorageClient(loadStorageConfig());
    const data = new Uint8Array(await c.req.arrayBuffer());
    await storage.save(key, data, contentType);
    return c.json({ ok: true }, 200);
  } catch (e) {
    if (e instanceof StorageError) {
      return c.json({ error: e.message }, 400);
    }
    throw e;
  }
};
