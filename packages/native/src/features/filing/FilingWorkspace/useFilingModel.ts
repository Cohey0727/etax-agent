import {
  DeductionState,
  FilingFigures,
  FilingSnapshotFigures,
  Transaction,
  computeCorrectedFigures,
  computeFilingFigures,
  filterYear,
  snapshotFiguresOf,
} from "@etax/shared";
import { useMemo } from "react";
import { FilingSnapshot, createFilingSnapshot } from "@/api";
import { useAppState } from "@/state/AppContext";
import { useFilingSnapshots } from "../useFilingSnapshots";

/** 確定申告画面の各タブが使う、申告入力と帳簿から求めた値。 */
export interface FilingModel {
  year: number;
  /** 全年度の取引（基準期間など他の年分を見る計算用） */
  transactions: Transaction[];
  /** 対象年の取引（割り当て年度で絞り込み済み） */
  yearTransactions: Transaction[];
  deductionState: DeductionState;
  /** 帳簿と申告入力から求めた所得と所得税額（web と同じ computeFilingFigures の結果） */
  figures: FilingFigures;
  /** 前年の事業所得（青色申告特別控除前）。貸借対照表の繰越で元入金を求めるのに使う */
  previousIncomeBeforeBlue: number;
  /** 確定スナップショットの一覧（昇順）。未読込・未接続時は null */
  snapshots: FilingSnapshot[] | null;
  /** いまの計算結果（確定スナップショットと同じ形） */
  currentFigures: FilingSnapshotFigures;
  /** 「控除・計算」を確定した直後に計算結果を控える。控えられたか */
  confirmCalculation: () => Promise<boolean>;
}

/**
 * 申告入力と帳簿から、確定申告画面の数字を1回だけ求める。
 * 所得の要約・税額・確定スナップショットはすべて computeFilingFigures の結果から作る。
 */
export function useFilingModel(deductionState: DeductionState): FilingModel {
  const { year, transactions } = useAppState();
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeFilingFigures(transactions, year, deductionState),
    [transactions, year, deductionState],
  );
  const currentFigures = useMemo(() => snapshotFiguresOf(figures), [figures]);
  // 前年の事業所得（青色申告特別控除前）。申告の種類には左右されない。
  const previousIncomeBeforeBlue = useMemo(
    () =>
      computeCorrectedFigures(filterYear(transactions, year - 1), year - 1)._detail
        .business_income_before_deduction,
    [transactions, year],
  );

  // 確定は総合タブと控除タブのどちらからでも行えるため、確定スナップショットの
  // 一覧と保存処理はここだけに置く。
  const { snapshots, refresh: refreshSnapshots } = useFilingSnapshots(year);
  const confirmCalculation = async () => {
    const created = await createFilingSnapshot(year, currentFigures);
    await refreshSnapshots();
    return created !== null;
  };

  return {
    year,
    transactions,
    yearTransactions,
    deductionState,
    figures,
    previousIncomeBeforeBlue,
    snapshots,
    currentFigures,
    confirmCalculation,
  };
}
