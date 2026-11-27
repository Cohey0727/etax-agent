import {
  ComputeCorrectedFiguresOptions,
  CorrectedFigures,
  DeductionState,
  ExpandedIncomeBreakdown,
  IncomeTaxResult,
  Transaction,
  buildSnapshotFigures,
  computeCorrectedFigures,
  computeExpandedIncomes,
  computeIncomeTax,
  computeManualIncomes,
  filterYear,
  resolveTaxCreditInputs,
} from "@etax/shared";
import { useMemo } from "react";
import { FilingSnapshot, FilingSnapshotFigures, createFilingSnapshot } from "@/api";
import { useAppState } from "@/state/AppContext";
import { IncomeSummaryFigures, summarizeIncome } from "../incomeSummaryFigures";
import { useFilingSnapshots } from "../useFilingSnapshots";

/** 確定申告画面の各タブが使う、申告入力と帳簿から求めた値。 */
export interface FilingModel {
  year: number;
  /** 全年度の取引（基準期間など他の年分を見る計算用） */
  transactions: Transaction[];
  /** 対象年の取引（割り当て年度で絞り込み済み） */
  yearTransactions: Transaction[];
  deductionState: DeductionState;
  /** 対象年の申告数値（農業所得の入力を含む） */
  computed: CorrectedFigures;
  /** 前年の申告数値（貸借対照表の繰越で元入金を計算するための提案値） */
  previousComputed: CorrectedFigures;
  incomeSummary: IncomeSummaryFigures;
  /** 配当・一時・株式等譲渡の内訳 */
  expandedBreakdown: ExpandedIncomeBreakdown;
  taxResult: IncomeTaxResult;
  /** 確定スナップショットの一覧（昇順）。未読込・未接続時は null */
  snapshots: FilingSnapshot[] | null;
  /** いまの計算結果（確定スナップショットと同じ形）。取引が無い年は null */
  currentFigures: FilingSnapshotFigures | null;
  /** 「控除・計算」を確定した直後に計算結果を控える。控えられたか */
  confirmCalculation: () => Promise<boolean>;
}

/**
 * 申告入力と帳簿から、確定申告画面の数字を1回だけ求める。
 * 所得の要約・税額・確定スナップショットはすべてここで同じ入力から作る。
 */
export function useFilingModel(deductionState: DeductionState): FilingModel {
  const { year, transactions } = useAppState();
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);

  // 申告数値の計算には農業所得の入力も渡す（青色申告特別控除の上限・配分と
  // 農業所得の算入が変わるため）。所得の要約・確定スナップショットも同じ値を使う。
  const { filingType, realEstateBusinessScale, agriculture } = deductionState;
  const figuresOptions: ComputeCorrectedFiguresOptions = useMemo(
    () => ({ filingType, realEstateBusinessScale, agriculture }),
    [filingType, realEstateBusinessScale, agriculture],
  );
  const computed = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, figuresOptions),
    [yearTransactions, year, figuresOptions],
  );
  // 前年の事業所得（青色申告特別控除前）。申告種別は当年の設定で近似する。
  const previousComputed = useMemo(
    () => computeCorrectedFigures(filterYear(transactions, year - 1), year - 1, figuresOptions),
    [transactions, year, figuresOptions],
  );

  const manualIncomes = useMemo(
    () =>
      computeManualIncomes(
        year,
        deductionState.salaryIncome,
        deductionState.miscIncome,
        computed._detail.business_income +
          computed._detail.real_estate_income +
          computed._detail.agriculture_income,
      ),
    [year, deductionState.salaryIncome, deductionState.miscIncome, computed],
  );
  // 拡張所得（配当・一時・株式等譲渡）の内訳。総合課税分は合計所得へ加算し、
  // 申告分離分は分離課税として計算する。配当控除の対象額は配当の内訳から
  // 導出した額を優先する（税額控除パネルの手入力との二重適用を防ぐ）。
  const expandedBreakdown = useMemo(
    () => computeExpandedIncomes(deductionState.expandedIncome),
    [deductionState.expandedIncome],
  );
  const incomeSummary = useMemo(
    () =>
      summarizeIncome(computed, manualIncomes, expandedBreakdown.comprehensiveAddition, filingType),
    [computed, manualIncomes, expandedBreakdown, filingType],
  );
  const totalIncome = incomeSummary.totalIncome;
  const taxResult = useMemo(
    () =>
      computeIncomeTax({
        year,
        totalIncome,
        deductions: deductionState.deductions,
        taxCredits: resolveTaxCreditInputs(deductionState.taxCredits, expandedBreakdown),
        separateTaxation: {
          stockIncome: expandedBreakdown.separateStockIncome,
          dividendIncome: expandedBreakdown.separateDividendIncome,
        },
      }),
    [year, totalIncome, deductionState.deductions, deductionState.taxCredits, expandedBreakdown],
  );

  // 確定は総合タブと控除タブのどちらからでも行えるため、確定スナップショットの
  // 一覧と保存処理はここだけに置く。
  const { snapshots, refresh: refreshSnapshots } = useFilingSnapshots(year);
  const currentFigures = useMemo(
    () =>
      buildSnapshotFigures(
        yearTransactions,
        year,
        figuresOptions,
        deductionState.miscIncome,
        taxResult,
        deductionState.salaryIncome,
      ),
    [yearTransactions, year, figuresOptions, deductionState.miscIncome, taxResult, deductionState.salaryIncome],
  );
  const confirmCalculation = async () => {
    if (!currentFigures) return true;
    const created = await createFilingSnapshot(year, currentFigures);
    await refreshSnapshots();
    return created !== null;
  };

  return {
    year,
    transactions,
    yearTransactions,
    deductionState,
    computed,
    previousComputed,
    incomeSummary,
    expandedBreakdown,
    taxResult,
    snapshots,
    currentFigures,
    confirmCalculation,
  };
}
