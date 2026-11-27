import { validateFixedAssetInput } from "@etax/shared";
import { useCallback, useEffect, useRef, useState } from "react";
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
 * 画像の一覧は一覧のサムネイルにも使うので、資産ごとに1回だけ取得する。
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
        (e: unknown) => {
          setImages((prev) => ({ ...prev, [asset.id]: [] }));
          setError(e instanceof Error ? e.message : "画像の取得に失敗しました");
        },
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
    setSelectedId((prev) =>
      prev !== null && fetchedAssets.some((asset) => asset.id === prev)
        ? prev
        : (fetchedAssets[0]?.id ?? null),
    );
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

  const select = (assetId: number) => {
    setSelectedId(assetId);
    setDeleteArmedId(null);
  };

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
      imagesRequestedRef.current.delete(asset.id);
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
