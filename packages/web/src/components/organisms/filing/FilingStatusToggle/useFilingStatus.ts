import { useCallback, useEffect, useState } from "react";
import { FilingStatus } from "@types";
import { fetchFilingStatuses, updateFilingStatus } from "@utils/api";

/**
 * ステータスがどこかで切り替わったら、開いている全インスタンスに
 * 読み直しを伝えるためのイベント名。総合タブ・各タブ・比較パネルが
 * それぞれ自分のインスタンスを持つため、切り替えを相互に知らせる。
 */
const STATUS_CHANGED_EVENT = "etax:filing-status-changed";

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
  /** 項目の済/未を反転してサーバーへ保存する。 */
  toggle: (key: FilingStatusKey) => Promise<void>;
}

/**
 * 申告ステータス（確定印）の読み書きを共有するフック。
 * 総合タブの一覧と、各タブの「確定する」が同じ保存先を見るために使う。
 * ステータスはダッシュボードの表示ともサーバー保存を共有する。
 */
export const useFilingStatus = (year: number): UseFilingStatusResult => {
  const [status, setStatus] = useState<FilingStatus>(EMPTY_STATUS);
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(false);
  const [savingKey, setSavingKey] = useState<FilingStatusKey | null>(null);

  const load = useCallback(async () => {
    const result = await fetchFilingStatuses();
    setLoaded(true);
    if (result === null) {
      setAvailable(false);
      return;
    }
    setStatus(result.find((s) => s.year === year) ?? EMPTY_STATUS);
    setAvailable(true);
  }, [year]);

  useEffect(() => {
    void load();
    // 他のインスタンス（別タブ・別パネル）での切り替えに追従する。
    const onChanged = () => void load();
    window.addEventListener(STATUS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(STATUS_CHANGED_EVENT, onChanged);
  }, [load]);

  const toggle = async (key: FilingStatusKey) => {
    setSavingKey(key);
    const patch: { confirmed?: boolean; calculated?: boolean; submitted?: boolean } = {};
    patch[key] = !status[key];
    const updated = await updateFilingStatus(year, patch);
    setSavingKey(null);
    if (updated) {
      setStatus(updated);
      window.dispatchEvent(new Event(STATUS_CHANGED_EVENT));
    }
  };

  return { status, loaded, available, savingKey, toggle };
};
