/**
 * fixedAssetImageUrl.ts — 固定資産画像の表示用URL（lib）。
 *
 * s3 ドライバでは署名付きURL（ブラウザがストレージから直接取得する）を
 * 返し、local ドライバでは自前の配信エンドポイントのパスを返す。
 */
import { fixedAssetObjectKey, StorageClient } from "../gateways/storageGateway";

/** 表示用URLの有効期限（秒）。画面を開くたびに発行し直す前提。 */
export const IMAGE_URL_EXPIRES_IN_SECONDS = 3600;

export async function fixedAssetImageDisplayUrl(
  storage: StorageClient,
  fileId: string,
): Promise<string> {
  const signed = await storage.presignDownload(
    fixedAssetObjectKey(fileId),
    IMAGE_URL_EXPIRES_IN_SECONDS,
  );
  return signed ?? `/api/fixed-assets/images/${fileId}/content`;
}
