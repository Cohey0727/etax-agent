import {
  ConsumptionMethod,
  Transaction,
  aggregateIncome,
  blueDeduction,
  consumptionTax,
  estimateInputTax,
  filterYear,
  residentialRentTotal,
  taxableSalesFromBreakdown,
} from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { useAuth } from "@/auth/AuthContext";
import {
  DeductionState,
  freshDeductionState,
  hydrateDeductionStateFromServer,
} from "@/features/filing/deductionState";
import { space } from "@/theme";
import { ConsumptionTaxComparison, ConsumptionTaxRow } from "../ConsumptionTaxComparison";
import { IncomeSummary } from "../IncomeSummary";

export interface DashboardPanelProps {
  transactions: Transaction[];
  year: number;
}

const methodOrder: readonly ConsumptionMethod[] = ["standard", "simplified", "special20"];

/** 所得サマリーと消費税比較（申告種別は申告入力の保存値を正とする）。 */
export function DashboardPanel({ transactions, year }: DashboardPanelProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [deductionState, setDeductionState] = useState<DeductionState>(() => freshDeductionState());

  useEffect(() => {
    let cancelled = false;
    void hydrateDeductionStateFromServer(userId, year)
      .then((state) => {
        if (!cancelled) setDeductionState(state);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, year]);

  const tx = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const breakdown = useMemo(() => aggregateIncome(tx), [tx]);
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
        const result = consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, inputTax, method });
        return { method, outputTax: result.outputTax, inputTax: result.inputTax, payable: result.payable };
      }),
    [taxable, nontaxable, inputTax],
  );

  return (
    <View style={styles.col}>
      <AppText size="sm" tone="muted">
        {year}年の集計 ／ 取引 {tx.length} 件（全 {transactions.length} 件）／ 税込経理
      </AppText>
      <IncomeSummary
        breakdown={breakdown}
        blue={blue}
        filingType={deductionState.filingType}
        realEstateBusinessScale={deductionState.realEstateBusinessScale}
      />
      <ConsumptionTaxComparison
        year={year}
        taxable={taxable}
        nontaxable={nontaxable}
        inputTax={inputTax}
        results={results}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space.md },
});
