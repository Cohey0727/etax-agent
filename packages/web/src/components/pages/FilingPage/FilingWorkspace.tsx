import {
  computeCorrectedFigures,
  computeFilingFigures,
  filterYear,
  snapshotFiguresOf,
  Transaction,
  UNCLASSIFIED_CATEGORY,
} from "@etax/shared";
import { ComponentType, useMemo, useState } from "react";
import { Col, Text } from "@components/atoms";
import { AlertBox, Tabs } from "@components/molecules";
import { RetryNotice } from "@components/molecules/RetryNotice";
import {
  DEDUCTION_STATE_LOAD_FAILED,
  FilingSection,
  FilingStatusKey,
  useDeductionState,
  useFilingSnapshots,
  useFilingStatus,
} from "@components/organisms/filing";
import { AppView, FilingTab } from "@types";
import { createFilingSnapshot } from "@utils/api";
import { pathForView } from "@utils/routing";
import { FilingBalanceTab } from "./FilingBalanceTab";
import { FilingConsumptionTab } from "./FilingConsumptionTab";
import { FilingDeductionsTab } from "./FilingDeductionsTab";
import { FilingOverviewTab } from "./FilingOverviewTab";
import { FilingTabProps, LedgerFilterKind } from "./FilingTabProps";

export interface FilingWorkspaceProps {
  transactions: Transaction[];
  year: number;
  onNavigate?: (view: AppView) => void;
  /** 選択中のタブ。URL（AppPage が保持）と連動する。 */
  tab: FilingTab;
  onTabChange: (tab: FilingTab) => void;
}

/** タブの並び。総合が起点で、収支・控除・消費税はそれぞれ独立した作業場。納税者情報は独立画面。 */
const FILING_TABS = [
  { id: "overview", label: "総合", Component: FilingOverviewTab },
  { id: "balance", label: "収支", Component: FilingBalanceTab },
  { id: "deductions", label: "控除", Component: FilingDeductionsTab },
  { id: "consumption", label: "消費税", Component: FilingConsumptionTab },
] as const satisfies readonly {
  id: FilingTab;
  label: string;
  Component: ComponentType<FilingTabProps>;
}[];

/** 帳簿画面を開くときの URL の絞り込み（各タブの警告の種類ごと）。 */
const LEDGER_FILTER_SEARCH: Record<LedgerFilterKind, (year: number) => string> = {
  mismatch: (year) => `?filters=year,mismatch&year=${year}`,
  taxUnset: (year) => `?filters=year,taxCategory&year=${year}&tax=`,
  unclassified: (year) => `?filters=year,category&year=${year}&cat=${encodeURIComponent(UNCLASSIFIED_CATEGORY)}`,
};

const STATUS_SAVE_FAILED = "申告ステータスを保存できませんでした。サーバーへの接続を確認してください。";
const SNAPSHOT_SAVE_FAILED =
  "確定した時点の計算結果を控えられませんでした。サーバーへの接続を確認してください。";

/**
 * 確定申告画面の作業領域。年度ごとに作り直す（key={year}）。
 * 申告入力・申告ステータス・確定スナップショットをここで1つずつ持ち、
 * 所得と税額もここで1回だけ計算して、各タブへ同じ値を渡す。
 * 「控除・計算」を確定すると計算結果がスナップショットとして控えられ、
 * 差し戻して再確定するときに前回確定との比較に使う。
 * タブの選択自体はURLが正で、ここでは保持しない。
 */
export const FilingWorkspace = ({
  transactions,
  year,
  onNavigate,
  tab,
  onTabChange,
}: FilingWorkspaceProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const deduction = useDeductionState(year);
  const figures = useMemo(
    () => computeFilingFigures(transactions, year, deduction.state),
    [transactions, year, deduction.state],
  );
  const currentFigures = useMemo(() => snapshotFiguresOf(figures), [figures]);
  // 前年の事業所得（青色申告特別控除前）。申告の種類には左右されない。
  const previousIncomeBeforeBlue = useMemo(
    () =>
      computeCorrectedFigures(filterYear(transactions, year - 1), year - 1)._detail
        .business_income_before_deduction,
    [transactions, year],
  );
  const filingStatus = useFilingStatus(year);
  const { snapshots, refresh: refreshSnapshots } = useFilingSnapshots(year);
  const [statusError, setStatusError] = useState<string | null>(null);

  // 確定の切り替えは、保存できたときだけ反映する。「控除・計算」を確定したら
  // その時点の計算結果をスナップショットとして控える（再確定時の比較用）。
  const handleToggleStatus = async (key: FilingStatusKey) => {
    setStatusError(null);
    const updated = await filingStatus.toggle(key);
    if (!updated) {
      setStatusError(STATUS_SAVE_FAILED);
      return;
    }
    if (key === "calculated" && updated.calculated) {
      if (!(await createFilingSnapshot(year, currentFigures))) {
        setStatusError(SNAPSHOT_SAVE_FAILED);
        return;
      }
      await refreshSnapshots();
    }
  };

  // 各タブの警告から、帳簿画面をこの年度＋警告種別のフィルターで開く。
  // URLにクエリを付けてから画面遷移すると、AppPage のURL同期は
  // パスが同じためクエリを消さず、帳簿側がマウント時に読み取る。
  const openLedger = (kind: LedgerFilterKind) => {
    window.history.pushState(
      null,
      "",
      `${pathForView(AppView.Ledger, year)}${LEDGER_FILTER_SEARCH[kind](year)}`,
    );
    onNavigate?.(AppView.Ledger);
  };

  // 総合タブのセクションリンク。納税者情報だけはタブではなく独立画面へ遷移する。
  const openSection = (section: FilingSection) => {
    if (section === "taxpayer") {
      onNavigate?.(AppView.Taxpayer);
    } else {
      onTabChange(section);
    }
  };

  const { Component } = FILING_TABS.find((item) => item.id === tab) ?? FILING_TABS[0];

  return (
    <Col gap="md">
      <Tabs items={FILING_TABS} activeId={tab} onChange={onTabChange} />
      {deduction.loadFailed ? (
        <RetryNotice message={DEDUCTION_STATE_LOAD_FAILED} onRetry={deduction.retry} />
      ) : null}
      {filingStatus.loaded && !filingStatus.available ? (
        <Text variant="muted">
          ステータスを保存するサーバーに接続できていません。「確定する」は接続時に使えます。
        </Text>
      ) : null}
      {statusError ? <AlertBox variant="error">{statusError}</AlertBox> : null}
      <Component
        year={year}
        transactions={transactions}
        yearTransactions={yearTransactions}
        deduction={deduction}
        figures={figures}
        previousIncomeBeforeBlue={previousIncomeBeforeBlue}
        filingStatus={filingStatus}
        onToggleStatus={(key) => void handleToggleStatus(key)}
        snapshots={snapshots}
        currentFigures={currentFigures}
        onOpenSection={openSection}
        onOpenLedger={openLedger}
      />
    </Col>
  );
};
