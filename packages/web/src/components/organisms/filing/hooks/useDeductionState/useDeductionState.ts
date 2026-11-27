import { DeductionState } from "@etax/shared";
import { useEffect, useState } from "react";
import {
  hydrateDeductionStateFromServer,
  loadDeductionState,
  saveDeductionState,
} from "../../DeductionPanel/deductionStorage";

/** 申告入力を読み込めなかったときに出す文言。 */
export const DEDUCTION_STATE_LOAD_FAILED =
  "申告入力をサーバーから読み込めませんでした。読み込めるまで、ここでの変更は保存されません。";

export interface UseDeductionStateResult {
  /** 対象年の申告入力。サーバー値を取り込むまでは端末のキャッシュ（無ければ空）。 */
  state: DeductionState;
  /** サーバー値の取り込みが終わったか。終わるまでは変更を保存しない。 */
  hydrated: boolean;
  /** サーバーから読み込めなかったか。 */
  loadFailed: boolean;
  /** 一部を書き換えて、取り込み後なら保存する。 */
  update: (patch: Partial<DeductionState>) => void;
  /** 状態をまるごと差し替えて、取り込み後なら保存する。 */
  replace: (next: DeductionState) => void;
  /** 読み込みに失敗したあと、もう一度読み込む。 */
  retry: () => void;
}

/**
 * 年度別の申告入力（DeductionState）を読み書きするフック。年度ごとに
 * 作り直す（key={year}）前提で、year は変わらない。
 * サーバー値を取り込むまでは保存しない。保存は状態全体の置き換えなので、
 * 取り込み前（または取り込みに失敗した状態）で保存すると、保存済みの
 * 控除などを空で上書きしてしまうため。
 */
export const useDeductionState = (year: number): UseDeductionStateResult => {
  const [state, setState] = useState<DeductionState>(() => loadDeductionState(year));
  const [hydrated, setHydrated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void hydrateDeductionStateFromServer(year).then((ok) => {
      if (cancelled) return;
      if (!ok) {
        setLoadFailed(true);
        return;
      }
      setState(loadDeductionState(year));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [year, loadAttempt]);

  const replace = (next: DeductionState) => {
    setState(next);
    if (hydrated) saveDeductionState(year, next);
  };

  return {
    state,
    hydrated,
    loadFailed,
    update: (patch) => replace({ ...state, ...patch }),
    replace,
    retry: () => {
      setLoadFailed(false);
      setLoadAttempt((n) => n + 1);
    },
  };
};
