import {
  BlueDeductionOptions,
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  MiscIncomeInput,
  SalaryIncomeInput,
  Transaction,
  computeCorrectedFigures,
  computeManualIncomes,
  filterYear,
} from "@etax/shared";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { space } from "@/theme";
import { formatYen } from "@/utils";
import { ResultRow, StatBlock } from "../fields";

export interface IncomeSummaryProps {
  transactions: Transaction[];
  /** 選択中の年度 */
  year: number;
  /** 青色申告特別控除の計算条件（申告の種類・不動産の規模） */
  filingOptions?: BlueDeductionOptions;
  /** 雑所得。帳簿に載らない所得として合計に含める。 */
  miscIncome?: MiscIncomeInput;
  /** 給与所得。帳簿に載らない所得として合計に含める。 */
  salaryIncome?: SalaryIncomeInput;
}

/**
 * 「収支」行の直下に置く収支の要約。収支（収入・支出・差引）を見直したら、
 * その結果である所得の数字を真下で確認して、そのまま「確定」にできるようにする。
 */
export function IncomeSummary({
  transactions,
  year,
  filingOptions,
  miscIncome,
  salaryIncome,
}: IncomeSummaryProps) {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, filingOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [yearTransactions, year, filingOptions?.filingType, filingOptions?.realEstateBusinessScale],
  );
  // 収入・支出の見出しは事業＋不動産だけを数える（収支タブの
  // BalanceSummary と同じ）。口座の生の出入り（チャージ・振替・投資・
  // カード決済などの「その他」区分）まで合計すると実態とかけ離れる。
  const incomeTotal = figures.business_revenue + figures.real_estate_revenue;
  const expenseTotal = figures.business_expenses + figures.real_estate_expenses;

  if (yearTransactions.length === 0) {
    return (
      <AppText size="sm" tone="muted">
        この年の取引はまだありません。先に帳簿へ取り込んでください。
      </AppText>
    );
  }

  const isWhite = filingOptions?.filingType === "white";
  const suffix = isWhite ? "" : "（青色控除後）";
  const manual = computeManualIncomes(
    year,
    salaryIncome ?? EMPTY_SALARY_INCOME,
    miscIncome ?? EMPTY_MISC_INCOME,
    figures._detail.business_income + figures._detail.real_estate_income,
  );
  const totalIncome =
    figures._detail.business_income + figures._detail.real_estate_income + manual.total;
  const statCards: readonly { label: string; value: string }[] = [
    { label: "収入合計", value: formatYen(incomeTotal) },
    { label: "支出合計", value: formatYen(expenseTotal) },
    { label: "収支（差引）", value: formatYen(incomeTotal - expenseTotal) },
    { label: `所得合計${suffix}`, value: formatYen(totalIncome) },
  ];
  const bridgeRows: readonly { label: string; amount: number }[] = [
    { label: "事業の差引", amount: figures.business_revenue - figures.business_expenses },
    { label: "不動産の差引", amount: figures.real_estate_revenue - figures.real_estate_expenses },
    {
      label: isWhite ? "青色申告特別控除（白色申告のためなし）" : "青色申告特別控除",
      amount: -figures.blue_deduction,
    },
    ...(manual.salary > 0 ? [{ label: "給与所得", amount: manual.salary }] : []),
    ...(manual.pension > 0 ? [{ label: "雑所得（公的年金等）", amount: manual.pension }] : []),
    ...(manual.miscBusiness > 0 ? [{ label: "雑所得（業務）", amount: manual.miscBusiness }] : []),
    ...(manual.miscOther > 0 ? [{ label: "雑所得（その他）", amount: manual.miscOther }] : []),
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.statGrid}>
        {statCards.map((card) => (
          <StatBlock key={card.label} label={card.label} value={card.value} />
        ))}
      </View>
      <View>
        {bridgeRows.map((row) => (
          <ResultRow key={row.label} label={row.label} value={row.amount} />
        ))}
        <ResultRow label={`所得合計${suffix}`} value={totalIncome} strong />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
