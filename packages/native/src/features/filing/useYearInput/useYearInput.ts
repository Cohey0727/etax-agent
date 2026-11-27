import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/auth/AuthContext";
import { YearInputEntry, YearInputStore } from "../yearInputStore";

export interface UseYearInputResult<T> {
  /** ログイン中のユーザー・対象年の値。読み込み前は loading、取得できなければ failed。 */
  entry: YearInputEntry<T>;
  /** 現在の値から次の値を作って保存する（読み込みが終わる前は何もしない）。 */
  update: (change: (current: T) => T) => void;
  /** サーバーから読み直す（取得に失敗したときの再試行）。 */
  reload: () => void;
}

/**
 * 年度別の入力ストアを画面から使うフック。表示するたびにサーバーから読み直し、
 * 同じ年度を開いている他の画面の変更もそのまま反映される。
 */
export function useYearInput<T>(store: YearInputStore<T>, year: number): UseYearInputResult<T> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const entry = useSyncExternalStore(store.subscribe, () => store.get(userId, year));

  useEffect(() => {
    void store.refresh(userId, year);
  }, [store, userId, year]);

  const update = useCallback(
    (change: (current: T) => T) => store.update(userId, year, change),
    [store, userId, year],
  );
  const reload = useCallback(() => {
    void store.refresh(userId, year);
  }, [store, userId, year]);

  return { entry, update, reload };
}
