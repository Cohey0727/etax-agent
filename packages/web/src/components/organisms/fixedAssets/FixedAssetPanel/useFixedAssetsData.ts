import { validateFixedAssetInput } from "@etax/shared";
import { useCallback, useEffect, useState } from "react";
import {
  DepreciationSummary,
  FixedAssetImageRecord,
  FixedAssetInput,
  FixedAssetRecord,
} from "@types";
import {
  createFixedAsset,
  deleteFixedAsset,
  deleteFixedAssetImage,
  fetchDepreciationSummary,
  fetchFixedAssetImages,
  fetchFixedAssets,
  updateFixedAsset,
  uploadFixedAssetImage,
} from "@utils/api";

export type LoadStatus = "loading" | "ready" | "unavailable";

/**
 * useFixedAssetsData.ts — 固定資産台帳の読み込みと CRUD・画像の管理。
 * 台帳（DB）が正。サマリは対象年度ごとにサーバー集計を取り直す。
 */
export function useFixedAssetsData(year: number) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [assets, setAssets] = useState<FixedAssetRecord[]>([]);
  const [summary, setSummary] = useState<DepreciationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [images, setImages] = useState<Record<number, FixedAssetImageRecord[]>>({});
  const [imagesBusy, setImagesBusy] = useState(false);
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);

  const reload = useCallback(async (): Promise<boolean> => {
    const [fetchedAssets, fetchedSummary] = await Promise.all([
      fetchFixedAssets(),
      fetchDepreciationSummary(year),
    ]);
    if (!fetchedAssets) return false;
    setAssets(fetchedAssets);
    setSummary(fetchedSummary);
    setSelectedId((prev) =>
      prev !== null && fetchedAssets.some((asset) => asset.id === prev)
        ? prev
        : (fetchedAssets[0]?.id ?? null),
    );
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

  const select = useCallback(
    (assetId: number) => {
      setSelectedId(assetId);
      setDeleteArmedId(null);
      setImages((prev) => {
        if (prev[assetId] === undefined) void loadImages(assetId);
        return prev;
      });
    },
    [loadImages],
  );

  // 初回表示や年度切替で選択中資産の画像が未取得なら取りに行く。
  useEffect(() => {
    if (selectedId !== null && images[selectedId] === undefined && status === "ready") {
      void loadImages(selectedId);
    }
  }, [selectedId, images, status, loadImages]);

  const handleCreate = async (input: FixedAssetInput): Promise<boolean> => {
    const problem = validateFixedAssetInput(input);
    if (problem) {
      setError(problem);
      return false;
    }
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const created = await createFixedAsset(input);
      await reload();
      setSelectedId(created.id);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
      return false;
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

  const handleDelete = async (asset: FixedAssetRecord) => {
    if (deleteArmedId !== asset.id) {
      setDeleteArmedId(asset.id);
      return;
    }
    if (busy) return;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
      setDeleteArmedId(null);
    }
  };

  const handleUploadImages = async (assetId: number, files: File[]) => {
    if (files.length === 0 || imagesBusy) return;
    setImagesBusy(true);
    setError(null);
    const uploaded: FixedAssetImageRecord[] = [];
    try {
      for (const file of files) {
        uploaded.push(await uploadFixedAssetImage(assetId, file));
      }
      setImages((prev) => ({
        ...prev,
        [assetId]: [...(prev[assetId] ?? []), ...uploaded],
      }));
    } catch (e) {
      if (uploaded.length > 0) {
        setImages((prev) => ({
          ...prev,
          [assetId]: [...(prev[assetId] ?? []), ...uploaded],
        }));
      }
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
    setError,
    busy,
    selectedId,
    images,
    imagesBusy,
    deleteArmedId,
    select,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleUploadImages,
    handleDeleteImage,
  };
}
