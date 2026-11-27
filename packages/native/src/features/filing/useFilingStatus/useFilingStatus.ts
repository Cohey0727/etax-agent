import { useCallback, useEffect, useState } from "react";
import { FilingStatus, fetchFilingStatuses, updateFilingStatus } from "@/api";

/** 手動で「確定」を付けられる申告ステータスの項目。 */
export type FilingStatusKey = "confirmed" | "calculated" | "submitted";

const emptyStatus: FilingStatus = {
  year: 0,
  confirmed: false,
  confirmed_at: null,
  calculated: false,
  calculated_at: null,
  submitted: false,
  submitted_at: null,
};

/**
 * ステータスがどこかで切り替わったら、開いている全インスタンスに
 * 読み直しを伝えるための購読者。総合タブ・各タブがそれぞれ自分の
 * インスタンスを持つため、切り替えを相互に知らせる。
 */
const listeners = new Set<() => void>();

function notifyStatusChanged(): void {
  listeners.forEach((listener) => listener());
}

export interface UseFilingStatusResult {
  /** 対象年のステータス。読み込み前・未接続時は空（全て未）。 */
  status: FilingStatus;
  /** 読み込みが終わったか（成功・失敗を問わない）。 */
  loaded: boolean;
  /** サーバーから読み込めたか。false の間はトグルできない。 */
  available: boolean;
  /** 保存中の項目。保存していない間は null。 */
  savingKey: FilingStatusKey | null;
  /** 項目の済/未を反転してサーバーへ保存する。保存できなければ null。 */
  toggle: (key: FilingStatusKey) => Promise<FilingStatus | null>;
}

/** 確定の切り替えの結果。 */
export type FilingStatusToggleOutcome = "saved" | "statusFailed" | "confirmFailed";

/**
 * 済/未を切り替え、未→済にできたときだけ onConfirm（確定スナップショットの保存など）を
 * 続けて行う。ステータスを保存できなかったときは onConfirm を呼ばない
 * （確定していないのに「前回確定」の控えができてしまうため）。
 */
export async function toggleFilingStatus(
  turningOn: boolean,
  toggle: () => Promise<FilingStatus | null>,
  onConfirm?: () => Promise<boolean>,
): Promise<FilingStatusToggleOutcome> {
  const updated = await toggle();
  if (!updated) return "statusFailed";
  if (turningOn && onConfirm && !(await onConfirm())) return "confirmFailed";
  return "saved";
}

/**
 * 申告ステータス（確定印）の読み書きを共有するフック。
 * 総合タブの一覧と、各タブの「確定する」が同じ保存先を見るために使う。
 * ステータスはダッシュボードの表示ともサーバー保存を共有する。
 */
export function useFilingStatus(year: number): UseFilingStatusResult {
  const [status, setStatus] = useState<FilingStatus>(emptyStatus);
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
    setStatus(result.find((s) => s.year === year) ?? emptyStatus);
    setAvailable(true);
  }, [year]);

  useEffect(() => {
    void load();
    // 他のインスタンス（別タブ・別パネル）での切り替えに追従する。
    const onChanged = () => void load();
    listeners.add(onChanged);
    return () => {
      listeners.delete(onChanged);
    };
  }, [load]);

  const toggle = async (key: FilingStatusKey) => {
    setSavingKey(key);
    const patch: { confirmed?: boolean; calculated?: boolean; submitted?: boolean } = {};
    patch[key] = !status[key];
    const updated = await updateFilingStatus(year, patch);
    setSavingKey(null);
    if (updated) {
      setStatus(updated);
      notifyStatusChanged();
    }
    return updated;
  };

  return { status, loaded, available, savingKey, toggle };
}
