/**
 * assets.ts — 固定資産台帳（資産・償却・画像）のAPI。
 */
import { apiJson, apiJsonOrNull, ApiError } from "./client";
import { readLocalFileBytes, uploadViaPresignedUrl, UPLOADABLE_IMAGE_TYPES } from "./files";
import {
  DepreciationSummary,
  FixedAssetImageRecord,
  FixedAssetInput,
  FixedAssetRecord,
} from "./types";

/** 固定資産の一覧を取得する。DB未接続の場合は null。 */
export async function fetchFixedAssets(): Promise<FixedAssetRecord[] | null> {
  const data = await apiJsonOrNull<{ assets: FixedAssetRecord[] }>("/api/fixed-assets");
  return data?.assets ?? null;
}

/** 指定年度の償却サマリを取得する。DB未接続の場合は null。 */
export async function fetchDepreciationSummary(
  year: number,
): Promise<DepreciationSummary | null> {
  return apiJsonOrNull<DepreciationSummary>(`/api/fixed-assets/depreciation?year=${year}`);
}

/** 固定資産を1件登録する。 */
export async function createFixedAsset(input: FixedAssetInput): Promise<FixedAssetRecord> {
  const data = await apiJson<{ asset: FixedAssetRecord | null }>("/api/fixed-assets", {
    method: "POST",
    body: input,
  });
  if (!data.asset) throw new ApiError(500, "固定資産の登録に失敗しました");
  return data.asset;
}

/** 固定資産を1件更新する。 */
export async function updateFixedAsset(
  id: number,
  input: FixedAssetInput,
): Promise<FixedAssetRecord> {
  const data = await apiJson<{ asset: FixedAssetRecord | null }>(`/api/fixed-assets/${id}`, {
    method: "PUT",
    body: input,
  });
  if (!data.asset) throw new ApiError(500, "固定資産の更新に失敗しました");
  return data.asset;
}

/** 固定資産を1件削除する（添付画像も一緒に消える）。 */
export async function deleteFixedAsset(id: number): Promise<void> {
  await apiJson(`/api/fixed-assets/${id}`, { method: "DELETE" });
}

/** 固定資産の画像一覧を取得する（表示用URLつき）。 */
export async function fetchFixedAssetImages(
  assetId: number,
): Promise<FixedAssetImageRecord[]> {
  const data = await apiJson<{ images: FixedAssetImageRecord[] }>(
    `/api/fixed-assets/${assetId}/images`,
  );
  return data.images;
}

/** 端末上の画像を固定資産へ添付する（署名付きURL経由）。 */
export async function uploadFixedAssetImage(
  assetId: number,
  uri: string,
  mimeType: string,
): Promise<FixedAssetImageRecord> {
  if (!UPLOADABLE_IMAGE_TYPES.includes(mimeType)) {
    throw new Error("対応していないファイル形式です（JPEG / PNG / WebP / GIF のみ）");
  }
  const bytes = await readLocalFileBytes(uri);
  const fileId = await uploadViaPresignedUrl(bytes, mimeType, "fixed_asset");
  const data = await apiJson<{ image: FixedAssetImageRecord | null }>(
    `/api/fixed-assets/${assetId}/images`,
    { method: "POST", body: { file_id: fileId } },
  );
  if (!data.image) throw new ApiError(500, "画像の添付に失敗しました");
  return data.image;
}

/** 固定資産の画像を1件取り外す（実体も削除される）。 */
export async function deleteFixedAssetImage(assetId: number, fileId: string): Promise<void> {
  await apiJson(`/api/fixed-assets/${assetId}/images/${fileId}`, { method: "DELETE" });
}
