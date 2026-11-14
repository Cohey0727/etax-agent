/**
 * storageGateway.ts — ファイルストレージ（Garage / S3互換）への接続（gateways）。
 *
 * 役割は2つだけ:
 *   1. ブラウザが直接アップロードするための署名付きURL（PUT）を発行する。
 *      発行には公開エンドポイント（ブラウザから到達できるURL）を使う。
 *   2. アップロード済みオブジェクトをサーバー内部エンドポイントから取得する。
 *      （コンテナ間通信など、内部向けURLで引く）
 *
 * 認証情報は署名にのみ使い、URL自体にはキーIDしか現れない（有効期限つき）。
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageConfig } from "../lib/config";

/** ストレージ操作の失敗を表す例外。 */
export class StorageError extends Error {}

/** 指定したオブジェクトが存在しない場合の例外。 */
export class StorageObjectNotFoundError extends StorageError {}

export interface DownloadedObject {
  dataBase64: string;
  mimeType: string;
}

export interface StorageClient {
  /** ブラウザ直アップロード用の署名付きURL（PUT）を発行する。 */
  presignUpload(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** オブジェクトを取得して Base64 で返す。 */
  download(key: string): Promise<DownloadedObject>;
}

/** 領収書アップロードのオブジェクトキー。ファイルIDから決定的に決まる。 */
export function receiptObjectKey(fileId: string): string {
  return `receipts/${fileId}`;
}

function createS3Client(endpoint: string, config: StorageConfig): S3Client {
  return new S3Client({
    endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId ?? "",
      secretAccessKey: config.secretAccessKey ?? "",
    },
    // Garage はパス形式（endpoint/bucket/key）を基本とする。
    forcePathStyle: true,
    // 署名付きURLにチェックサム計算（CRC32）を混ぜない。SDK 既定のままだと
    // 空ボディ前提のチェックサムが URL に入り、実ファイルのアップロードが
    // InvalidDigest で弾かれる。必要時だけ計算する設定にする。
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function createStorageClient(config: StorageConfig): StorageClient {
  if (!config.configured || !config.publicEndpoint || !config.internalEndpoint) {
    throw new StorageError(
      "ファイルストレージ（Garage）が設定されていません。" +
        "S3_PUBLIC_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY を設定してください",
    );
  }
  const publicClient = createS3Client(config.publicEndpoint, config);
  const internalClient = createS3Client(config.internalEndpoint, config);
  return {
    async presignUpload(key, contentType, expiresInSeconds) {
      try {
        return await getSignedUrl(
          publicClient,
          new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
          { expiresIn: expiresInSeconds },
        );
      } catch (e) {
        throw new StorageError(
          `アップロード用URLの発行に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    async download(key) {
      try {
        const object = await internalClient.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
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
        if (e instanceof StorageError) throw e;
        if (e instanceof Error && e.name === "NoSuchKey") {
          throw new StorageObjectNotFoundError(`ファイルが見つかりません: ${key}`);
        }
        throw new StorageError(
          `ファイルの取得に失敗しました: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
  };
}
