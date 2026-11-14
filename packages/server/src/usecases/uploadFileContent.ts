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

const CONTENT_PATH_PREFIX = "/api/files/content/";

export const uploadFileContentHandler = async (c: Context) => {
  const key = c.req.path.slice(CONTENT_PATH_PREFIX.length);
  if (!key) {
    return c.json({ error: "ファイルキーが指定されていません" }, 400);
  }
  try {
    const storage = createStorageClient(loadStorageConfig());
    const data = new Uint8Array(await c.req.arrayBuffer());
    const contentType = c.req.header("content-type") || "application/octet-stream";
    await storage.save(key, data, contentType);
    return c.json({ ok: true }, 200);
  } catch (e) {
    if (e instanceof StorageError) {
      return c.json({ error: e.message }, 400);
    }
    throw e;
  }
};
