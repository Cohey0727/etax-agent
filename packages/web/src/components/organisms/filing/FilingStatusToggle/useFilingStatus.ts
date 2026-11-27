import { useEffect, useState } from "react";
import { FilingStatus } from "@types";
import { fetchFilingStatuses, updateFilingStatus } from "@utils/api";

/** 手動で「確定」を付けられる申告ステータスの項目。 */
export type FilingStatusKey = "confirmed" | "calculated" | "submitted";

const EMPTY_STATUS: FilingStatus = {
  year: 0,
  confirmed: false,
  confirmed_at: null,
  calculated: false,
  calculated_at: null,
  submitted: false,
  submitted_at: null,
};

export interface UseFilingStatusResult {
  /** 対象年のステータス。読み込み前・未接続時は空（全て未）。 */
  status: FilingStatus;
  /** 読み込みが終わったか（成功・失敗を問わない）。 */
  loaded: boolean;
  /** サーバーから読み込めたか。false の間はトグルできない。 */
  available: boolean;
  /** 保存中の項目。保存していない間は null。 */
  savingKey: FilingStatusKey | null;
  /**
   * 項目の済/未を反転してサーバーへ保存する。保存できたら保存後の
   * ステータスを、できなかったら null を返す。
   */
  toggle: (key: FilingStatusKey) => Promise<FilingStatus | null>;
}

/**
 * 申告ステータス（確定印）の読み書きをするフック。確定申告画面が1つだけ
 * 持ち、総合タブ・各タブの「確定する」と前回確定との比較へ渡す。
 * ステータスはダッシュボードの表示ともサーバー保存を共有する。
 * 年度ごとに作り直す（key={year}）前提で、year は変わらない。
 */
export const useFilingStatus = (year: number): UseFilingStatusResult => {
  const [status, setStatus] = useState<FilingStatus>(EMPTY_STATUS);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [savingKey, setSavingKey] = useState<FilingStatusKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFilingStatuses().then((result) => {
      if (cancelled) return;
      setLoaded(true);
      if (result === null) return;
      setStatus(result.find((s) => s.year === year) ?? EMPTY_STATUS);
      setAvailable(true);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const toggle = async (key: FilingStatusKey) => {
    setSavingKey(key);
    const patch: { confirmed?: boolean; calculated?: boolean; submitted?: boolean } = {};
    patch[key] = !status[key];
    const updated = await updateFilingStatus(year, patch);
    setSavingKey(null);
    if (updated) setStatus(updated);
    return updated;
  };

  return { status, loaded, available, savingKey, toggle };
};
