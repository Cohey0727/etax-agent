import { Transaction } from "@etax/shared";
import { useCallback, useMemo, useState } from "react";
import {
  readExtraYears,
  readStoredYear,
  saveExtraYears,
  saveStoredYear,
} from "./appPageStorage";

/**
 * useYearSelection.ts — 年度選択の状態（AppPage 用フック）。
 * 選択中の年度は端末に保存し、次回も同じ年度から始める。
 * 取引がまだ無い年度も、年度セレクタの「YYYY年度を追加」で足せる。
 */
export function useYearSelection(transactions: Transaction[], initialYear: number | undefined) {
  const [selectedYear, setSelectedYear] = useState<number>(
    () => initialYear ?? readStoredYear(),
  );
  const [extraYears, setExtraYears] = useState<number[]>(() => readExtraYears());
  const years = useMemo(
    () => [...new Set([...transactions.map((t) => t.year), ...extraYears])].sort((a, b) => b - a),
    [transactions, extraYears],
  );

  // 年度の切替は端末に保存し、次回も同じ年度から始める。
  const handleYearChange = useCallback((nextYear: number) => {
    setSelectedYear(nextYear);
    saveStoredYear(nextYear);
  }, []);

  const handleAddYear = useCallback(
    (nextYear: number) => {
      if (!extraYears.includes(nextYear)) {
        const next = [...extraYears, nextYear];
        setExtraYears(next);
        saveExtraYears(next);
      }
      handleYearChange(nextYear);
    },
    [extraYears, handleYearChange],
  );

  /**
   * ログインしたアカウントの保存値を読み直す（保存値はアカウントごとに分かれており、
   * ログインの確認が終わるまでどのアカウントの値かが決まらない）。起動時の URL に
   * 年度があれば、その年度を選んだままにする。
   */
  const reloadStoredYears = useCallback(() => {
    if (initialYear === undefined) setSelectedYear(readStoredYear());
    setExtraYears(readExtraYears());
  }, [initialYear]);

  // 選択中の年がデータに無い場合は、描画時点で最新の年に詰める
  const year = years.includes(selectedYear) ? selectedYear : (years[0] ?? new Date().getFullYear());

  return { years, year, selectedYear, handleYearChange, handleAddYear, reloadStoredYears };
}
