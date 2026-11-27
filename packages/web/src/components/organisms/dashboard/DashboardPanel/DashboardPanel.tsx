import { dashboardFigures, DeductionState, filterYear, isAgricultureEmpty, Transaction } from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Col, Text } from "@components/atoms";
import { hydrateDeductionStateFromServer, loadDeductionState } from "@components/organisms/filing";
import { ConsumptionTaxComparison } from "../ConsumptionTaxComparison";
import { DashboardIncomeSummary } from "../DashboardIncomeSummary";

export interface DashboardPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
}

export const DashboardPanel = ({ transactions, year }: DashboardPanelProps) => {
  const tx = useMemo(() => filterYear(transactions, year), [transactions, year]);
  // 申告の種類・農業所得は申告入力（サーバーの保存値が正）から取る。サーバーから
  // 取り込むまでは端末のキャッシュを出し、取り込んだ値はその年度のときだけ使う。
  const [hydrated, setHydrated] = useState<{ year: number; state: DeductionState } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void hydrateDeductionStateFromServer(year)
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setHydrated({ year, state: loadDeductionState(year) });
      });
    return () => {
      cancelled = true;
    };
  }, [year]);
  const cachedState = useMemo(() => loadDeductionState(year), [year]);
  const deductionState = hydrated?.year === year ? hydrated.state : cachedState;
  const figures = useMemo(
    () =>
      dashboardFigures(tx, year, {
        filingType: deductionState.filingType,
        realEstateBusinessScale: deductionState.realEstateBusinessScale,
        agriculture: deductionState.agriculture,
      }),
    [
      tx,
      year,
      deductionState.filingType,
      deductionState.realEstateBusinessScale,
      deductionState.agriculture,
    ],
  );

  return (
    <Col gap="md">
      <Text variant="muted">
        {year}年の集計 ／ 取引 {tx.length} 件（全 {transactions.length} 件）／ 税込経理
      </Text>
      <DashboardIncomeSummary
        breakdown={figures.breakdown}
        blue={figures.blue}
        blueDeductionLimit={figures.blueDeductionLimit}
        hasAgricultureIncome={!isAgricultureEmpty(deductionState.agriculture)}
      />
      <ConsumptionTaxComparison
        year={year}
        taxable={figures.taxableSalesIncl}
        nontaxable={figures.nontaxableSalesIncl}
        inputTax={figures.inputTaxEstimate}
        specialRate={figures.smallBusinessSpecialRate}
        results={figures.consumption}
      />
    </Col>
  );
};
