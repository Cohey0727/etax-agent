/**
 * useAssetsData.ts — 固定資産台帳の読み込みと CRUD・画像の管理。
 * 台帳（DB）が正。サマリは対象年度ごとにサーバー集計を取り直す。
 * 画像の一覧は一覧のサムネイルにも使うので、資産ごとに1回だけ取得する。
 */
import { validateFixedAssetInput } from "@etax/shared";
import { useCallback, useEffect, useRef, useState } from "react";
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

  // 最後に出した読み込みの番号。年度を切り替えた後に前の年度の応答が届いても反映しない。
  const latestReloadRef = useRef(0);
  // 画像一覧を取得済み・取得中の資産。
  const imagesRequestedRef = useRef(new Set<number>());

  const loadImagesOnce = useCallback((list: readonly FixedAssetRecord[]) => {
    for (const asset of list) {
      if (imagesRequestedRef.current.has(asset.id)) continue;
      imagesRequestedRef.current.add(asset.id);
      void fetchFixedAssetImages(asset.id).then(
        (fetched) => setImages((prev) => ({ ...prev, [asset.id]: fetched })),
        () => setImages((prev) => ({ ...prev, [asset.id]: [] })),
      );
    }
  }, []);

  /** 台帳とサマリを読み直す。後から出した読み込みがあれば何も反映せず "stale" を返す。 */
  const reload = useCallback(async (): Promise<LoadStatus | "stale"> => {
    const request = ++latestReloadRef.current;
    const [fetchedAssets, fetchedSummary] = await Promise.all([
      fetchFixedAssets(),
      fetchDepreciationSummary(year),
    ]);
    if (request !== latestReloadRef.current) return "stale";
    if (!fetchedAssets) return "unavailable";
    setAssets(fetchedAssets);
    setSummary(fetchedSummary);
    loadImagesOnce(fetchedAssets);
    return "ready";
  }, [year, loadImagesOnce]);

  useEffect(() => {
    setStatus("loading");
    setError(null);
    void reload().then((result) => {
      if (result !== "stale") setStatus(result);
    });
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
      imagesRequestedRef.current.delete(asset.id);
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
    handleCreate,
    handleUpdate,
    handleDelete,
    handleUploadImage,
    handleDeleteImage,
  };
}
