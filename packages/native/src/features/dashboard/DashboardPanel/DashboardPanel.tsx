import {
  DeductionState,
  Transaction,
  dashboardFigures,
  filterYear,
  freshDeductionState,
  isAgricultureEmpty,
} from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { useAuth } from "@/auth/AuthContext";
import { hydrateDeductionStateFromServer } from "@/features/filing/deductionState";
import { space } from "@/theme";
import { ConsumptionTaxComparison } from "../ConsumptionTaxComparison";
import { IncomeSummary } from "../IncomeSummary";

export interface DashboardPanelProps {
  transactions: Transaction[];
  year: number;
}

/** 所得サマリーと消費税比較（申告種別は申告入力の保存値を正とする）。 */
export function DashboardPanel({ transactions, year }: DashboardPanelProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // 取り込んだ申告入力は、取り込んだときの利用者・年度と組にして持ち、一致するときだけ使う。
  const [loaded, setLoaded] = useState<{
    userId: number | null;
    year: number;
    state: DeductionState;
  } | null>(null);
  const [emptyState] = useState(() => freshDeductionState());

  useEffect(() => {
    let cancelled = false;
    void hydrateDeductionStateFromServer(userId, year)
      .then((state) => {
        if (!cancelled) setLoaded({ userId, year, state });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, year]);
  const deductionState =
    loaded !== null && loaded.userId === userId && loaded.year === year ? loaded.state : emptyState;

  const tx = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () =>
      dashboardFigures(tx, {
        filingType: deductionState.filingType,
        realEstateBusinessScale: deductionState.realEstateBusinessScale,
        agriculture: deductionState.agriculture,
      }),
    [
      tx,
      deductionState.filingType,
      deductionState.realEstateBusinessScale,
      deductionState.agriculture,
    ],
  );

  return (
    <View style={styles.col}>
      <AppText size="sm" tone="muted">
        {year}年の集計 ／ 取引 {tx.length} 件（全 {transactions.length} 件）／ 税込経理
      </AppText>
      <IncomeSummary
        breakdown={figures.breakdown}
        blue={figures.blue}
        filingType={deductionState.filingType}
        realEstateBusinessScale={deductionState.realEstateBusinessScale}
        hasAgricultureIncome={!isAgricultureEmpty(deductionState.agriculture)}
      />
      <ConsumptionTaxComparison
        year={year}
        taxable={figures.taxableSalesIncl}
        nontaxable={figures.nontaxableSalesIncl}
        inputTax={figures.inputTaxEstimate}
        results={figures.consumption}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space.md },
});
