import {
  computeCorrectedFigures,
  computeIncomeTax,
  DeductionInputs,
  filterYear,
  TaxCreditInputs,
  Transaction,
} from "@etax/shared";
import { useMemo, useState } from "react";
import { Col } from "@components/atoms";
import {
  ConsumptionTaxPanel,
  DeductionPanel,
  FilingPanel,
  TaxCreditPanel,
  TaxpayerPanel,
} from "@components/organisms/filing";
import {
  DeductionState,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { ViewPageProps } from "@types";

export const FilingPage = ({ transactions, year, onNavigate }: ViewPageProps) => {
  return (
    <Col gap="md">
      <FilingPanel transactions={transactions} year={year} onNavigate={onNavigate} />
      <FilingInputPanels key={year} transactions={transactions} year={year} />
      <ConsumptionTaxPanel transactions={transactions} year={year} />
    </Col>
  );
};

interface FilingInputPanelsProps {
  transactions: Transaction[];
  year: number;
}

/**
 * 控除・税額控除の入力と e-Tax 出力。その時点の情報をできるだけ正しく
 * 入れるのが本体で、入力は年度ごとに保存され、修正申告の画面
 * （過去の確定分との比較）と共有される。
 */
const FilingInputPanels = ({ transactions, year }: FilingInputPanelsProps) => {
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

  return (
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
      <TaxpayerPanel
        year={year}
        transactions={yearTransactions}
        deductions={deductionState.deductions}
        taxCredits={deductionState.taxCredits}
        originalIncomeTax={null}
      />
    </>
  );
};
