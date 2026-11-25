/**
 * storageGateway.ts — ファイルストレージへの接続（gateways）。
 *
 * ドライバは2つ（lib/config の StorageConfig）:
 *   - local: データフォルダ配下のローカルフォルダ。アップロード実体は
 *     このサーバーの PUT /api/files/content/<key> が受け取る。
 *   - s3: S3互換ストレージ（本番は Garage）。アップロード/表示は署名付き
 *     URLでブラウザがストレージと直接やり取りし、APIサーバーは署名と
 *     メタ操作だけを行う（バイト列は経由しない）。サーバー自身が中身を
 *     要する処理（領収書の解析など）は内部エンドポイント経由で取得する。
 *
 * MIMEタイプは local では本体ファイルの隣に <key>.meta（テキスト）として
 * 保存し、s3 ではオブジェクトの ContentType として保存する。
 */
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3StorageConfig, StorageConfig } from "../lib/config";

/** ストレージ操作の失敗を表す例外。 */
export class StorageError extends Error {}

/** 指定したファイルが存在しない場合の例外。 */
export class StorageObjectNotFoundError extends StorageError {}

export interface DownloadedObject {
  dataBase64: string;
  mimeType: string;
}

/** オブジェクトの実在確認結果（HEAD）。 */
export interface ObjectHead {
  size: number;
  contentType: string;
}

export interface StorageClient {
  /**
   * ブラウザ直アップロード用の署名付きURLを返す。
   * s3 はストレージの公開エンドポイントを指す絶対URL、local はこの
   * サーバーの PUT エンドポイントを指す相対URL（同一オリジン）。
   */
  presignUpload(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /**
   * ブラウザ直表示用の署名付きURLを返す。local ドライバは署名URLを
   * 持たないため null（呼び出し側は自前の配信エンドポイントへ誘導する）。
   */
  presignDownload(key: string, expiresInSeconds: number): Promise<string | null>;
  /** アップロード実体を保存する。 */
  save(key: string, data: Uint8Array, contentType: string): Promise<void>;
  /** ファイルを取得して Base64 で返す。 */
  download(key: string): Promise<DownloadedObject>;
  /** オブジェクトの実在とメタ情報を返す。無ければ null。 */
  head(key: string): Promise<ObjectHead | null>;
  /** オブジェクトを削除する。無くても失敗にしない。 */
  deleteObject(key: string): Promise<void>;
}

/** 領収書アップロードのオブジェクトキー。ファイルIDから決定的に決まる。 */
export function receiptObjectKey(fileId: string): string {
  return `receipts/${fileId}`;
}

/** 固定資産画像のオブジェクトキー。ファイルIDから決定的に決まる。 */
export function fixedAssetObjectKey(fileId: string): string {
  return `fixed-assets/${fileId}`;
}

/** 受信通知PDFのオブジェクトキー。ファイルIDから決定的に決まる。 */
export function filingReceiptObjectKey(fileId: string): string {
  return `filing-receipts/${fileId}`;
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

function createLocalStorageClient(filesDir: string): StorageClient {
  return {
    async presignUpload(key) {
      resolveKeyPath(filesDir, key);
      return `/api/files/content/${key}`;
    },
    async presignDownload() {
      return null;
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
    async head(key) {
      const path = resolveKeyPath(filesDir, key);
      try {
        const info = await stat(path);
        let contentType = "application/octet-stream";
        try {
          const meta = (await readFile(`${path}.meta`, "utf8")).trim();
          if (meta) contentType = meta;
        } catch {
          // メタが無ければ既定のMIMEを使う。
        }
        return { size: info.size, contentType };
      } catch {
        return null;
      }
    },
    async deleteObject(key) {
      const path = resolveKeyPath(filesDir, key);
      await rm(path, { force: true });
      await rm(`${path}.meta`, { force: true });
    },
  };
}

function createS3Client(config: S3StorageConfig, endpoint: string): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Garage はパス形式アドレスが必須。
    forcePathStyle: true,
    // 署名付きPUTに空ボディのチェックサムが付くと Garage が弾くため、
    // チェックサムは必須の場合だけ計算する。
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function createS3StorageClient(config: S3StorageConfig): StorageClient {
  // 署名付きURLはブラウザが到達する公開エンドポイントで発行し、
  // サーバー自身の操作は内部エンドポイントで行う。
  const publicClient = createS3Client(config, config.endpoint);
  const internalClient = createS3Client(config, config.internalEndpoint);
  const bucket = config.bucket;
  return {
    async presignUpload(key, contentType, expiresInSeconds) {
      try {
        return await getSignedUrl(
          publicClient,
          new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
          { expiresIn: expiresInSeconds },
        );
      } catch (e) {
        throw new StorageError(
          `アップロードURLの発行に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    async presignDownload(key, expiresInSeconds) {
      try {
        return await getSignedUrl(
          publicClient,
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: expiresInSeconds },
        );
      } catch (e) {
        throw new StorageError(
          `ダウンロードURLの発行に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    async save(key, data, contentType) {
      try {
        await internalClient.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: data,
            ContentType: contentType || "application/octet-stream",
          }),
        );
      } catch (e) {
        throw new StorageError(
          `ファイルの保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    async download(key) {
      try {
        const object = await internalClient.send(
          new GetObjectCommand({ Bucket: bucket, Key: key }),
        );
        if (!object.Body) {
          throw new StorageObjectNotFoundError(`ファイルが見つかりません: ${key}`);
        }
        const bytes = await object.Body.transformToByteArray();
        return {
          dataBase64: Buffer.from(bytes).toString("base64"),
          mimeType: object.ContentType || "application/octet-stream",
        };
      } catch (e) {
        if (e instanceof StorageObjectNotFoundError) throw e;
        if (e instanceof Error && (e.name === "NoSuchKey" || e.name === "NotFound")) {
          throw new StorageObjectNotFoundError(`ファイルが見つかりません: ${key}`);
        }
        throw new StorageError(
          `ファイルの取得に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    async head(key) {
      try {
        const object = await internalClient.send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        );
        return {
          size: object.ContentLength ?? 0,
          contentType: object.ContentType || "application/octet-stream",
        };
      } catch (e) {
        if (e instanceof Error && (e.name === "NotFound" || e.name === "NoSuchKey")) {
          return null;
        }
        throw new StorageError(
          `ファイルの確認に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    async deleteObject(key) {
      try {
        await internalClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (e) {
        throw new StorageError(
          `ファイルの削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  };
}

export function createStorageClient(config: StorageConfig): StorageClient {
  if (config.driver === "s3") {
    if (!config.s3) {
      throw new StorageError(
        "S3ストレージの設定が不足しています（ETAX_STORAGE_S3_* を確認してください）",
      );
    }
    return createS3StorageClient(config.s3);
  }
  return createLocalStorageClient(config.filesDir);
}
