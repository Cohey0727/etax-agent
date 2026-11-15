import {
  computeCorrectedFigures,
  computeIncomeTax,
  DeductionInputs,
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
  TaxCreditPanel,
  TaxpayerPanel,
  TaxpayerProfilePanel,
} from "@components/organisms/filing";
import {
  DeductionState,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { AppView, FilingTab, ViewPageProps } from "@types";

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
  const computed = useMemo(
    () => computeCorrectedFigures(yearTransactions, year),
    [yearTransactions, year],
  );
  const [deductionState, setDeductionState] = useState<DeductionState>(() =>
    loadDeductionState(year),
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
          onNavigate={onNavigate}
          onOpenSection={onTabChange}
        />
        <TaxpayerPanel
          year={year}
          transactions={yearTransactions}
          deductions={deductionState.deductions}
          taxCredits={deductionState.taxCredits}
          originalIncomeTax={null}
          onOpenSection={onTabChange}
        />
      </>
    ),
    ledger: (
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">帳簿の確認</Text>
          <ConfirmSummary transactions={transactions} year={year} />
        </Col>
      </Card>
    ),
    deductions: (
      <>
        <DeductionPanel
          year={year}
          deductions={deductionState.deductions}
          breakdown={taxResult.deductions}
          onChange={updateDeductions}
        />
        <TaxCreditPanel
          taxCredits={deductionState.taxCredits}
          result={taxResult}
          onChange={updateTaxCredits}
        />
      </>
    ),
    consumption: <ConsumptionTaxPanel transactions={transactions} year={year} />,
    taxpayer: <TaxpayerProfilePanel year={year} />,
  };

  return (
    <Col gap="md">
      <Tabs items={FILING_TABS} activeId={tab} onChange={onTabChange} />
      {tabContent[tab]}
    </Col>
  );
};
