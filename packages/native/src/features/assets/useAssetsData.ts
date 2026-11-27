/**
 * useAssetsData.ts — 固定資産台帳の読み込みと CRUD・画像の管理。
 * 台帳（DB）が正。サマリは対象年度ごとにサーバー集計を取り直す。
 */
import { validateFixedAssetInput } from "@etax/shared";
import { useCallback, useEffect, useState } from "react";
import {
  DepreciationSummary,
  FixedAssetImageRecord,
  FixedAssetInput,
  FixedAssetRecord,
  createFixedAsset,
  deleteFixedAsset,
  deleteFixedAssetImage,
  fetchDepreciationSummary,
  fetchFixedAssetImages,
  fetchFixedAssets,
  updateFixedAsset,
  uploadFixedAssetImage,
} from "@/api";

export type LoadStatus = "loading" | "ready" | "unavailable";

export function useAssetsData(year: number) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [assets, setAssets] = useState<FixedAssetRecord[]>([]);
  const [summary, setSummary] = useState<DepreciationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<Record<number, FixedAssetImageRecord[]>>({});
  const [imagesBusy, setImagesBusy] = useState(false);

  const loadImages = useCallback(async (assetId: number) => {
    setImagesBusy(true);
    try {
      const fetched = await fetchFixedAssetImages(assetId);
      setImages((prev) => ({ ...prev, [assetId]: fetched }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像の取得に失敗しました");
    } finally {
      setImagesBusy(false);
    }
  }, []);

  const reload = useCallback(async (): Promise<boolean> => {
    const [fetchedAssets, fetchedSummary] = await Promise.all([
      fetchFixedAssets(),
      fetchDepreciationSummary(year),
    ]);
    if (!fetchedAssets) return false;
    setAssets(fetchedAssets);
    setSummary(fetchedSummary);
    // 一覧のサムネイル用に各資産の画像も取り込む（失敗した資産は空扱い）。
    const entries = await Promise.all(
      fetchedAssets.map(async (asset) => {
        const list = await fetchFixedAssetImages(asset.id).catch(() => []);
        return [asset.id, list] as const;
      }),
    );
    setImages(Object.fromEntries(entries));
    return true;
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    void (async () => {
      const ok = await reload();
      if (cancelled) return;
      setStatus(ok ? "ready" : "unavailable");
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const handleCreate = async (input: FixedAssetInput): Promise<FixedAssetRecord | null> => {
    const problem = validateFixedAssetInput(input);
    if (problem) {
      setError(problem);
      return null;
    }
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const created = await createFixedAsset(input);
      await reload();
      return created;
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (id: number, input: FixedAssetInput): Promise<boolean> => {
    const problem = validateFixedAssetInput(input);
    if (problem) {
      setError(problem);
      return false;
    }
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await updateFixedAsset(id, input);
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (asset: FixedAssetRecord): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await deleteFixedAsset(asset.id);
      setImages((prev) => {
        const next = { ...prev };
        delete next[asset.id];
        return next;
      });
      await reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleUploadImage = async (assetId: number, uri: string, mimeType: string) => {
    if (imagesBusy) return;
    setImagesBusy(true);
    setError(null);
    try {
      const uploaded = await uploadFixedAssetImage(assetId, uri, mimeType);
      setImages((prev) => ({
        ...prev,
        [assetId]: [...(prev[assetId] ?? []), uploaded],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像のアップロードに失敗しました");
    } finally {
      setImagesBusy(false);
    }
  };

  const handleDeleteImage = async (assetId: number, fileId: string) => {
    if (imagesBusy) return;
    setImagesBusy(true);
    setError(null);
    try {
      await deleteFixedAssetImage(assetId, fileId);
      setImages((prev) => ({
        ...prev,
        [assetId]: (prev[assetId] ?? []).filter((image) => image.file_id !== fileId),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "画像の削除に失敗しました");
    } finally {
      setImagesBusy(false);
    }
  };

  return {
    status,
    assets,
    summary,
    error,
    busy,
    images,
    imagesBusy,
    loadImages,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleUploadImage,
    handleDeleteImage,
  };
}
