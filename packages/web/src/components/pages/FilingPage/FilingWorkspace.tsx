import {
  BlueDeductionOptions,
  computeCorrectedFigures,
  computeExpandedIncomes,
  computeIncomeTax,
  computeManualIncomes,
  DeductionInputs,
  ExpandedIncomeInput,
  MiscIncomeInput,
  SalaryIncomeInput,
  XtxBalanceSheetInput,
  filterYear,
  resolveTaxCreditInputs,
  TaxCreditInputs,
  Transaction,
} from "@etax/shared";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Card, Col, Text } from "@components/atoms";
import { Tabs } from "@components/molecules";
import {
  BalanceRecords,
  BalanceSheetPanel,
  BalanceSummary,
  ConsumptionTaxPanel,
  DeductionPanel,
  ExpandedIncomePanel,
  FilingPanel,
  FilingSection,
  FilingStatusToggle,
  MiscIncomePanel,
  MonthlyBalance,
  SalaryPanel,
  SubmissionRecordPanel,
  TaxCreditPanel,
  TaxpayerPanel,
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
  hydrateDeductionStateFromServer,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { AppView, FilingTab } from "@types";
import { createFilingSnapshot } from "@utils/api";
import { pathForView } from "@utils/routing";

/** タブの並び。総合が起点で、収支・控除・消費税はそれぞれ独立した作業場。納税者情報は独立画面。 */
const FILING_TABS: readonly { id: FilingTab; label: string }[] = [
  { id: "overview", label: "総合" },
  { id: "balance", label: "収支" },
  { id: "deductions", label: "控除" },
  { id: "consumption", label: "消費税" },
];

export interface FilingWorkspaceProps {
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
export const FilingWorkspace = ({
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
  // 申告入力の正はサーバーDB。表示時にサーバー値を取り込んでから再読込する。
  // 取り込みが終わるまでは保存しない（端末に値が無い状態で編集すると
  // 空状態がサーバーへ全体置換され、保存済みの控除等が消えてしまうため。
  // 納税者画面と同じガード。Issue #10-4 の横展開）。
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void hydrateDeductionStateFromServer(year).then(() => {
      if (cancelled) return;
      setDeductionState(loadDeductionState(year));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);
  const filingOptions: BlueDeductionOptions = {
    filingType: deductionState.filingType,
    realEstateBusinessScale: deductionState.realEstateBusinessScale,
  };
  const computed = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, filingOptions),
    [yearTransactions, year, deductionState.filingType, deductionState.realEstateBusinessScale],
  );
  // 前年の事業所得（青色申告特別控除前）。貸借対照表の繰越で元入金を
  // 計算するために使う（申告種別は当年の設定で近似する提案値）。
  const previousComputed = useMemo(
    () => computeCorrectedFigures(filterYear(transactions, year - 1), year - 1, filingOptions),
    [transactions, year, deductionState.filingType, deductionState.realEstateBusinessScale],
  );

  const updateDeductions = (next: DeductionInputs) => {
    const state = { ...deductionState, deductions: next };
    setDeductionState(state);
    if (hydrated) saveDeductionState(year, state);
  };
  const updateTaxCredits = (next: TaxCreditInputs) => {
    const state = { ...deductionState, taxCredits: next };
    setDeductionState(state);
    if (hydrated) saveDeductionState(year, state);
  };
  const updateMiscIncome = (next: MiscIncomeInput) => {
    const state = { ...deductionState, miscIncome: next };
    setDeductionState(state);
    if (hydrated) saveDeductionState(year, state);
  };
  const updateSalaryIncome = (next: SalaryIncomeInput) => {
    const state = { ...deductionState, salaryIncome: next };
    setDeductionState(state);
    if (hydrated) saveDeductionState(year, state);
  };
  const updateExpandedIncome = (next: ExpandedIncomeInput) => {
    const state = { ...deductionState, expandedIncome: next };
    setDeductionState(state);
    if (hydrated) saveDeductionState(year, state);
  };
  const updateBalanceSheet = (next: XtxBalanceSheetInput | null) => {
    const state = { ...deductionState, balanceSheet: next };
    setDeductionState(state);
    if (hydrated) saveDeductionState(year, state);
  };
  const updateBreakdownEntries = (key: BreakdownEntriesKey, entries: BreakdownEntry[]) => {
    const state = applyBreakdownEntries(deductionState, key, entries);
    setDeductionState(state);
    if (hydrated) saveDeductionState(year, state);
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

  const manualIncomes = computeManualIncomes(
    year,
    deductionState.salaryIncome,
    deductionState.miscIncome,
    computed._detail.business_income + computed._detail.real_estate_income,
  );
  // 拡張所得（配当・一時・株式等譲渡）の内訳。総合課税分は合計所得へ加算し、
  // 申告分離分は分離課税として計算する。配当控除の対象額は配当の内訳から
  // 導出した額を優先する（税額控除パネルの手入力との二重適用を防ぐ）。
  const expandedBreakdown = useMemo(
    () => computeExpandedIncomes(deductionState.expandedIncome),
    [deductionState.expandedIncome],
  );
  const totalIncome =
    computed._detail.business_income +
    computed._detail.real_estate_income +
    manualIncomes.total +
    expandedBreakdown.comprehensiveAddition;
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
    [year, totalIncome, deductionState, expandedBreakdown],
  );

  // 確定スナップショット（前回確定との比較用）。確定は総合タブと控除タブの
  // どちらからでも行えるため、保存処理はここに寄せて両方から使う。
  const { snapshots, refresh: refreshSnapshots } = useFilingSnapshots(year);
  const currentFigures = useMemo(
    () =>
      buildSnapshotFigures(
        transactions,
        year,
        filingOptions,
        deductionState.miscIncome,
        taxResult,
        deductionState.salaryIncome,
      ),
    [transactions, year, filingOptions, deductionState.miscIncome, taxResult, deductionState.salaryIncome],
  );
  const handleConfirmCalculation = async () => {
    if (!currentFigures) return;
    await createFilingSnapshot(year, currentFigures);
    await refreshSnapshots();
  };

  // 総合タブのセクションリンク。納税者情報だけはタブではなく独立画面へ遷移する。
  const openSection = (section: FilingSection) => {
    if (section === "taxpayer") {
      onNavigate?.(AppView.Taxpayer);
    } else {
      onTabChange(section);
    }
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
          salaryIncome={deductionState.salaryIncome}
          onOpenSection={openSection}
        />
        <TaxpayerPanel
          year={year}
          transactions={yearTransactions}
          deductions={deductionState.deductions}
          taxCredits={deductionState.taxCredits}
          miscIncome={deductionState.miscIncome}
          salaryIncome={deductionState.salaryIncome}
          expandedIncome={deductionState.expandedIncome}
          filingType={deductionState.filingType}
          realEstateBusinessScale={deductionState.realEstateBusinessScale}
          balanceSheet={deductionState.balanceSheet}
          originalIncomeTax={null}
          onOpenSection={openSection}
        />
        <SubmissionRecordPanel year={year} kind="income" />
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
              salaryIncome={deductionState.salaryIncome}
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
        <BalanceSheetPanel
          year={year}
          balanceSheet={deductionState.balanceSheet}
          incomeBeforeBlue={computed._detail.business_income_before_deduction}
          previousIncomeBeforeBlue={previousComputed._detail.business_income_before_deduction}
          filingType={deductionState.filingType}
          onChange={updateBalanceSheet}
        />
      </>
    ),
    deductions: (
      <>
        <SalaryPanel year={year} salaryIncome={deductionState.salaryIncome} onChange={updateSalaryIncome} />
        <MiscIncomePanel miscIncome={deductionState.miscIncome} onChange={updateMiscIncome} />
        <ExpandedIncomePanel
          expandedIncome={deductionState.expandedIncome}
          breakdown={expandedBreakdown}
          taxResult={taxResult}
          onChange={updateExpandedIncome}
        />
        <DeductionPanel
          year={year}
          deductions={deductionState.deductions}
          breakdown={taxResult.deductions}
          onChange={updateDeductions}
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
          dividendCreditDerived={expandedBreakdown.dividendDeclared}
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
      <>
        <ConsumptionTaxPanel transactions={transactions} year={year} onOpenLedger={openLedgerFiltered} />
        <SubmissionRecordPanel year={year} kind="consumption" />
      </>
    ),
  };

  return (
    <Col gap="md">
      <Tabs items={FILING_TABS} activeId={tab} onChange={onTabChange} />
      {tabContent[tab]}
    </Col>
  );
};
