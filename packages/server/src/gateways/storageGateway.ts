/**
 * storageGateway.ts — ファイルストレージ（ローカルフォルダ）への接続（gateways）。
 *
 * アップロードされたファイルはデータフォルダ配下（files/）に保存する。
 * 同梱アプリ前提のため外部ストレージ（S3互換）は使わない。
 *
 * 役割は3つ:
 *   1. ブラウザが直接アップロードするための受け口URLを返す
 *      （このサーバー自身の PUT /api/files/content/<key> を指す相対URL）。
 *   2. アップロード実体を受け取って保存する（save）。
 *   3. 保存済みファイルを取得する（download）。
 *
 * MIMEタイプは本体ファイルの隣に <key>.meta（テキスト）として保存する。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { StorageConfig } from "../lib/config";

/** ストレージ操作の失敗を表す例外。 */
export class StorageError extends Error {}

/** 指定したファイルが存在しない場合の例外。 */
export class StorageObjectNotFoundError extends StorageError {}

export interface DownloadedObject {
  dataBase64: string;
  mimeType: string;
}

export interface StorageClient {
  /**
   * ブラウザ直アップロード用の受け口URLを返す。
   * このサーバーの PUT エンドポイントを指す相対URL（同一オリジン）。
   */
  presignUpload(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** アップロード実体を保存する。 */
  save(key: string, data: Uint8Array, contentType: string): Promise<void>;
  /** ファイルを取得して Base64 で返す。 */
  download(key: string): Promise<DownloadedObject>;
}

/** 領収書アップロードのオブジェクトキー。ファイルIDから決定的に決まる。 */
export function receiptObjectKey(fileId: string): string {
  return `receipts/${fileId}`;
}

/** キーが保存先フォルダの外を指していないか検証し、実パスを返す。 */
function resolveKeyPath(filesDir: string, key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(key) || key.includes("..")) {
    throw new StorageError(`不正なファイルキーです: ${key}`);
  }
  const root = resolve(filesDir);
  const path = resolve(join(root, key));
  if (path !== root && !path.startsWith(root + sep)) {
    throw new StorageError(`不正なファイルキーです: ${key}`);
  }
  return path;
}

export function createStorageClient(config: StorageConfig): StorageClient {
  const filesDir = config.filesDir;
  return {
    async presignUpload(key) {
      resolveKeyPath(filesDir, key);
      return `/api/files/content/${key}`;
    },
    async save(key, data, contentType) {
      const path = resolveKeyPath(filesDir, key);
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, data);
        await writeFile(`${path}.meta`, contentType || "application/octet-stream", "utf8");
      } catch (e) {
        throw new StorageError(
          `ファイルの保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    async download(key) {
      const path = resolveKeyPath(filesDir, key);
      let bytes: Buffer;
      try {
        bytes = await readFile(path);
      } catch {
        throw new StorageObjectNotFoundError(`ファイルが見つかりません: ${key}`);
      }
      let mimeType = "application/octet-stream";
      try {
        const meta = (await readFile(`${path}.meta`, "utf8")).trim();
        if (meta) mimeType = meta;
      } catch {
        // メタが無ければ既定のMIMEを使う。
      }
      return { dataBase64: bytes.toString("base64"), mimeType };
    },
  };
}
