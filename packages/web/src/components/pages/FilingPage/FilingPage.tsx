import {
  BlueDeductionOptions,
  computeCorrectedFigures,
  computeIncomeTax,
  DeductionInputs,
  FilingType,
  MiscIncomeInput,
  filterYear,
  TaxCreditInputs,
  Transaction,
} from "@etax/shared";
import { ReactNode, useMemo, useState } from "react";
import { Card, Col, Text } from "@components/atoms";
import { Tabs } from "@components/molecules";
import {
  BalanceRecords,
  BalanceSummary,
  ConsumptionTaxPanel,
  DeductionPanel,
  FilingPanel,
  FilingStatusToggle,
  MiscIncomePanel,
  MonthlyBalance,
  TaxCreditPanel,
  TaxpayerPanel,
  TaxpayerProfilePanel,
} from "@components/organisms/filing";
import {
  ConfirmComparePanel,
  buildSnapshotFigures,
  useFilingSnapshots,
} from "@components/organisms/filing/ConfirmComparePanel";
import {
  BreakdownEntriesKey,
  BreakdownEntry,
  DeductionState,
  applyBreakdownEntries,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { AppView, FilingTab, ViewPageProps } from "@types";
import { createFilingSnapshot } from "@utils/api";
import { pathForView } from "@utils/routing";

/** タブの並び。総合が起点で、収支・控除・消費税はそれぞれ独立した作業場。 */
const FILING_TABS: readonly { id: FilingTab; label: string }[] = [
  { id: "overview", label: "総合" },
  { id: "balance", label: "収支" },
  { id: "deductions", label: "控除" },
  { id: "consumption", label: "消費税" },
  { id: "taxpayer", label: "納税者情報" },
];

export const FilingPage = ({
  transactions,
  year,
  onNavigate,
  filingTab,
  onFilingTabChange,
}: ViewPageProps) => {
  return (
    <FilingWorkspace
      key={year}
      transactions={transactions}
      year={year}
      onNavigate={onNavigate}
      tab={filingTab ?? "overview"}
      onTabChange={onFilingTabChange ?? (() => {})}
    />
  );
};

interface FilingWorkspaceProps {
  transactions: Transaction[];
  year: number;
  onNavigate?: (view: AppView) => void;
  /** 選択中のタブ。URL（AppPage が保持）と連動する。 */
  tab: FilingTab;
  onTabChange: (tab: FilingTab) => void;
}

/**
 * 控除入力の状態を持つ作業領域。控除の入力は年度ごとに保存される。
 * 「控除・計算」を確定すると計算結果がスナップショットとして控えられ、
 * 差し戻して再確定するときに前回確定との比較に使う。
 * タブの選択自体はURLが正で、ここでは保持しない。
 */
const FilingWorkspace = ({
  transactions,
  year,
  onNavigate,
  tab,
  onTabChange,
}: FilingWorkspaceProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const [deductionState, setDeductionState] = useState<DeductionState>(() =>
    loadDeductionState(year),
  );
  const filingOptions: BlueDeductionOptions = {
    filingType: deductionState.filingType,
    realEstateBusinessScale: deductionState.realEstateBusinessScale,
  };
  const computed = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, filingOptions),
    [yearTransactions, year, deductionState.filingType, deductionState.realEstateBusinessScale],
  );

  const updateDeductions = (next: DeductionInputs) => {
    const state = { ...deductionState, deductions: next };
    setDeductionState(state);
    saveDeductionState(year, state);
  };
  const updateTaxCredits = (next: TaxCreditInputs) => {
    const state = { ...deductionState, taxCredits: next };
    setDeductionState(state);
    saveDeductionState(year, state);
  };
  const updateMiscIncome = (next: MiscIncomeInput) => {
    const state = { ...deductionState, miscIncome: next };
    setDeductionState(state);
    saveDeductionState(year, state);
  };
  const updateFilingSettings = (filingType: FilingType, realEstateBusinessScale: boolean) => {
    const state = { ...deductionState, filingType, realEstateBusinessScale };
    setDeductionState(state);
    saveDeductionState(year, state);
  };
  const updateBreakdownEntries = (key: BreakdownEntriesKey, entries: BreakdownEntry[]) => {
    const state = applyBreakdownEntries(deductionState, key, entries);
    setDeductionState(state);
    saveDeductionState(year, state);
  };

  // 各タブの警告から、帳簿画面をこの年度＋警告種別のフィルターで開く。
  // URLにクエリを付けてから画面遷移すると、AppPage のURL同期は
  // パスが同じためクエリを消さず、帳簿側がマウント時に読み取る。
  const openLedgerFiltered = (kind: "mismatch" | "taxUnset" | "unclassified") => {
    const search =
      kind === "mismatch"
        ? `?filters=year,mismatch&year=${year}`
        : kind === "taxUnset"
          ? `?filters=year,taxCategory&year=${year}&tax=`
          : `?filters=year,category&year=${year}&cat=${encodeURIComponent("未分類")}`;
    window.history.pushState(null, "", `${pathForView(AppView.Ledger, year)}${search}`);
    onNavigate?.(AppView.Ledger);
  };

  const totalIncome =
    computed._detail.business_income +
    computed._detail.real_estate_income +
    deductionState.miscIncome.income;
  const taxResult = useMemo(
    () =>
      computeIncomeTax({
        year,
        totalIncome,
        deductions: deductionState.deductions,
        taxCredits: deductionState.taxCredits,
      }),
    [year, totalIncome, deductionState],
  );

  // 確定スナップショット（前回確定との比較用）。確定は総合タブと控除タブの
  // どちらからでも行えるため、保存処理はここに寄せて両方から使う。
  const { snapshots, refresh: refreshSnapshots } = useFilingSnapshots(year);
  const currentFigures = useMemo(
    () => buildSnapshotFigures(transactions, year, filingOptions, deductionState.miscIncome, taxResult),
    [transactions, year, filingOptions, deductionState.miscIncome, taxResult],
  );
  const handleConfirmCalculation = async () => {
    if (!currentFigures) return;
    await createFilingSnapshot(year, currentFigures);
    await refreshSnapshots();
  };

  const tabContent: Record<FilingTab, ReactNode> = {
    overview: (
      <>
        <FilingPanel
          transactions={transactions}
          year={year}
          taxResult={taxResult}
          filingOptions={filingOptions}
          miscIncome={deductionState.miscIncome}
          onOpenSection={onTabChange}
        />
        <TaxpayerPanel
          year={year}
          transactions={yearTransactions}
          deductions={deductionState.deductions}
          taxCredits={deductionState.taxCredits}
          miscIncome={deductionState.miscIncome}
          filingType={deductionState.filingType}
          realEstateBusinessScale={deductionState.realEstateBusinessScale}
          originalIncomeTax={null}
          onOpenSection={onTabChange}
        />
      </>
    ),
    balance: (
      <>
        <Card>
          <Col gap="md">
            <Text variant="sectionTitle">収支</Text>
            <BalanceSummary
              transactions={transactions}
              year={year}
              filingOptions={filingOptions}
              miscIncome={deductionState.miscIncome}
              onOpenUnclassified={() => openLedgerFiltered("unclassified")}
            />
            <FilingStatusToggle
              bare
              year={year}
              statusKey="confirmed"
              label="収支"
              description="収支の金額・科目・区分に誤りがないか見直したら、ここで確定できます（総合・ダッシュボードと共有）。"
            />
          </Col>
        </Card>
        <MonthlyBalance transactions={yearTransactions} />
        <BalanceRecords key={year} transactions={yearTransactions} />
      </>
    ),
    deductions: (
      <>
        <MiscIncomePanel miscIncome={deductionState.miscIncome} onChange={updateMiscIncome} />
        <DeductionPanel
          year={year}
          deductions={deductionState.deductions}
          breakdown={taxResult.deductions}
          onChange={updateDeductions}
          filingType={deductionState.filingType}
          realEstateBusinessScale={deductionState.realEstateBusinessScale}
          onFilingSettingsChange={updateFilingSettings}
          breakdownEntries={{
            donations: deductionState.donationEntries,
            socialInsurance: deductionState.socialInsuranceEntries,
            mutualAid: deductionState.mutualAidEntries,
            medical: deductionState.medicalEntries,
          }}
          onBreakdownEntriesChange={updateBreakdownEntries}
        />
        <TaxCreditPanel
          taxCredits={deductionState.taxCredits}
          result={taxResult}
          onChange={updateTaxCredits}
        />
        <ConfirmComparePanel year={year} snapshots={snapshots} currentFigures={currentFigures} />
        <FilingStatusToggle
          year={year}
          statusKey="calculated"
          label="控除・計算"
          description="所得控除・税額控除の入力が終わったら、ここで確定できます（総合・ダッシュボードと共有）。確定すると計算結果が控えられ、再確定のときに前回確定との差分が出ます。"
          onConfirm={handleConfirmCalculation}
        />
      </>
    ),
    consumption: (
      <ConsumptionTaxPanel transactions={transactions} year={year} onOpenLedger={openLedgerFiltered} />
    ),
    taxpayer: <TaxpayerProfilePanel year={year} />,
  };

  return (
    <Col gap="md">
      <Tabs items={FILING_TABS} activeId={tab} onChange={onTabChange} />
      {tabContent[tab]}
    </Col>
  );
};
