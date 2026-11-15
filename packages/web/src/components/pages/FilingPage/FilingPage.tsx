import {
  BlueDeductionOptions,
  computeCorrectedFigures,
  computeIncomeTax,
  DeductionInputs,
  FilingType,
  filterYear,
  TaxCreditInputs,
  Transaction,
} from "@etax/shared";
import { ReactNode, useMemo, useState } from "react";
import { Card, Col, Text } from "@components/atoms";
import { Tabs } from "@components/molecules";
import {
  ConfirmSummary,
  ConsumptionTaxPanel,
  DeductionPanel,
  FilingPanel,
  FilingStatusToggle,
  TaxCreditPanel,
  TaxpayerPanel,
  TaxpayerProfilePanel,
} from "@components/organisms/filing";
import {
  BreakdownEntriesKey,
  BreakdownEntry,
  DeductionState,
  applyBreakdownEntries,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { AppView, FilingTab, ViewPageProps } from "@types";
import { pathForView } from "@utils/routing";

/** タブの並び。総合が起点で、帳簿・控除・消費税はそれぞれ独立した作業場。 */
const FILING_TABS: readonly { id: FilingTab; label: string }[] = [
  { id: "overview", label: "総合" },
  { id: "ledger", label: "帳簿" },
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
 * 控除入力の状態を持つ作業領域。控除の入力は年度ごとに保存され、
 * 修正申告の画面（過去の確定分との比較）と共有される。
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

  // 消費税タブの警告から、帳簿画面をフィルター付きで開く。
  // URLにクエリを付けてから画面遷移すると、AppPage のURL同期は
  // パスが同じためクエリを消さず、帳簿側がマウント時に読み取る。
  const openLedgerFiltered = (search: string) => {
    window.history.pushState(null, "", `${pathForView(AppView.Ledger, year)}${search}`);
    onNavigate?.(AppView.Ledger);
  };

  const totalIncome = computed._detail.business_income + computed._detail.real_estate_income;
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

  const tabContent: Record<FilingTab, ReactNode> = {
    overview: (
      <>
        <FilingPanel
          transactions={transactions}
          year={year}
          taxResult={taxResult}
          filingOptions={filingOptions}
          onNavigate={onNavigate}
          onOpenSection={onTabChange}
        />
        <TaxpayerPanel
          year={year}
          transactions={yearTransactions}
          deductions={deductionState.deductions}
          taxCredits={deductionState.taxCredits}
          filingType={deductionState.filingType}
          realEstateBusinessScale={deductionState.realEstateBusinessScale}
          originalIncomeTax={null}
          onOpenSection={onTabChange}
        />
      </>
    ),
    ledger: (
      <>
        <Card>
          <Col gap="md">
            <Text variant="sectionTitle">帳簿</Text>
            <ConfirmSummary transactions={transactions} year={year} filingOptions={filingOptions} />
          </Col>
        </Card>
        <FilingStatusToggle
          year={year}
          statusKey="confirmed"
          label="帳簿"
          description="帳簿の金額・科目・区分に誤りがないか見直したら、ここで確定できます（総合・ダッシュボードと共有）。"
        />
      </>
    ),
    deductions: (
      <>
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
        <FilingStatusToggle
          year={year}
          statusKey="calculated"
          label="控除・計算"
          description="所得控除・税額控除の入力が終わったら、ここで確定できます（総合・ダッシュボードと共有）。"
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
