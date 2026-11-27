import { dashboardFigures, DeductionState, filterYear, Transaction } from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Col, Text } from "@components/atoms";
import { loadDeductionState } from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { ConsumptionTaxComparison } from "../ConsumptionTaxComparison";
import { IncomeSummary } from "../IncomeSummary";

export interface DashboardPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
}

export const DashboardPanel = ({ transactions, year }: DashboardPanelProps) => {
  const tx = useMemo(() => filterYear(transactions, year), [transactions, year]);
  // 申告の種類は納税者情報画面で管理し、保存先を共有する。年度が替わったら読み直す。
  const [deductionState, setDeductionState] = useState<DeductionState>(() =>
    loadDeductionState(year),
  );
  useEffect(() => {
    setDeductionState(loadDeductionState(year));
  }, [year]);
  const figures = useMemo(
    () =>
      dashboardFigures(tx, {
        filingType: deductionState.filingType,
        realEstateBusinessScale: deductionState.realEstateBusinessScale,
      }),
    [tx, deductionState.filingType, deductionState.realEstateBusinessScale],
  );

  return (
    <Col gap="md">
      <Text variant="muted">
        {year}年の集計 ／ 取引 {tx.length} 件（全 {transactions.length} 件）／ 税込経理
      </Text>
      <IncomeSummary
        breakdown={figures.breakdown}
        blue={figures.blue}
        filingType={deductionState.filingType}
        realEstateBusinessScale={deductionState.realEstateBusinessScale}
      />
      <ConsumptionTaxComparison
        year={year}
        taxable={figures.taxableSalesIncl}
        nontaxable={figures.nontaxableSalesIncl}
        inputTax={figures.inputTaxEstimate}
        results={figures.consumption}
      />
    </Col>
  );
};
