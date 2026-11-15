import {
  aggregateIncome,
  blueDeduction,
  consumptionTax,
  ConsumptionMethod,
  estimateInputTax,
  FilingType,
  filterYear,
  residentialRentTotal,
  taxableSalesFromBreakdown,
  Transaction,
} from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Col, Text } from "@components/atoms";
import {
  DeductionState,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { ConsumptionTaxComparison, ConsumptionTaxRow } from "../ConsumptionTaxComparison";
import { IncomeSummary } from "../IncomeSummary";

export interface DashboardPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
}

const methodOrder: readonly ConsumptionMethod[] = ["standard", "simplified", "special20"];

export const DashboardPanel = ({ transactions, year }: DashboardPanelProps) => {
  const tx = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const breakdown = useMemo(() => aggregateIncome(tx), [tx]);
  // 申告の種類は控除タブと保存先を共有する。年度が替わったら読み直す。
  const [deductionState, setDeductionState] = useState<DeductionState>(() =>
    loadDeductionState(year),
  );
  useEffect(() => {
    setDeductionState(loadDeductionState(year));
  }, [year]);
  const updateFilingSettings = (filingType: FilingType, realEstateBusinessScale: boolean) => {
    const state = { ...deductionState, filingType, realEstateBusinessScale };
    setDeductionState(state);
    saveDeductionState(year, state);
  };
  const blue = useMemo(
    () =>
      blueDeduction(breakdown.realEstateIncome, breakdown.businessIncome, {
        filingType: deductionState.filingType,
        realEstateBusinessScale: deductionState.realEstateBusinessScale,
      }),
    [breakdown, deductionState.filingType, deductionState.realEstateBusinessScale],
  );
  const rent = useMemo(() => residentialRentTotal(tx), [tx]);
  const [taxable, nontaxable] = useMemo(
    () => taxableSalesFromBreakdown(breakdown, rent),
    [breakdown, rent],
  );
  const inputTax = useMemo(() => estimateInputTax(tx), [tx]);
  const results = useMemo<ConsumptionTaxRow[]>(
    () =>
      methodOrder.map((method) => {
        const result = consumptionTax({
          taxableSalesIncl: taxable,
          nontaxableSalesIncl: nontaxable,
          inputTax,
          method,
        });
        return {
          method,
          outputTax: result.outputTax,
          inputTax: result.inputTax,
          payable: result.payable,
        };
      }),
    [taxable, nontaxable, inputTax],
  );

  return (
    <Col gap="md">
      <Text variant="muted">
        {year}年の集計 ／ 取引 {tx.length} 件（全 {transactions.length} 件）／ 税込経理
      </Text>
      <IncomeSummary
        breakdown={breakdown}
        blue={blue}
        filingType={deductionState.filingType}
        realEstateBusinessScale={deductionState.realEstateBusinessScale}
        onFilingSettingsChange={updateFilingSettings}
      />
      <ConsumptionTaxComparison
        year={year}
        taxable={taxable}
        nontaxable={nontaxable}
        inputTax={inputTax}
        results={results}
      />
    </Col>
  );
};
