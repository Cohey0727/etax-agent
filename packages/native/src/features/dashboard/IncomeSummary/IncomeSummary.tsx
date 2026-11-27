import { BlueDeduction, IncomeBreakdown } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, Card, LabeledValue } from "@/components";
import { space } from "@/theme";
import { formatYen } from "@/utils";

export interface IncomeSummaryProps {
  breakdown: IncomeBreakdown;
  blue: BlueDeduction;
  /** 青色申告特別控除の限度額（不動産・事業・農業を合わせた所得に対する額。白色は 0） */
  blueDeductionLimit: number;
  /** 申告入力に農業所得があるか（青色申告特別控除の農業分を出す） */
  hasAgricultureIncome: boolean;
}

/** 事業所得・不動産所得と青色申告特別控除のサマリー。 */
export function IncomeSummary({
  breakdown,
  blue,
  blueDeductionLimit,
  hasAgricultureIncome,
}: IncomeSummaryProps) {
  // 限度額は不動産・事業・農業を合わせた所得に対する1つの額なので、合計の行にだけ出す。
  const totalLabel =
    blueDeductionLimit > 0 ? `合計（最大${formatCap(blueDeductionLimit)}）` : "合計";
  return (
    <View style={styles.col}>
      <IncomeStatCard
        title="事業所得"
        revenue={breakdown.businessRevenue}
        expenses={breakdown.businessExpenses}
        income={breakdown.businessIncome}
        incomeAfterDeduction={breakdown.businessIncome - blue.business}
      />
      <IncomeStatCard
        title="不動産所得"
        revenue={breakdown.realEstateRevenue}
        expenses={breakdown.realEstateExpenses}
        income={breakdown.realEstateIncome}
        incomeAfterDeduction={breakdown.realEstateIncome - blue.realEstate}
      />
      <Card index={2}>
        <AppText size="lg" weight="bold">
          青色申告特別控除
        </AppText>
        <LabeledValue label="不動産分" value={formatYen(blue.realEstate)} />
        <LabeledValue label="事業分" value={formatYen(blue.business)} />
        {hasAgricultureIncome ? (
          <LabeledValue label="農業分" value={formatYen(blue.agriculture)} />
        ) : null}
        <LabeledValue label={totalLabel} value={formatYen(blue.total)} strong />
      </Card>
    </View>
  );
}

function formatCap(amount: number): string {
  return `${amount / 10_000}万円`;
}

interface IncomeStatCardProps {
  title: string;
  revenue: number;
  expenses: number;
  income: number;
  incomeAfterDeduction: number;
}

function IncomeStatCard({
  title,
  revenue,
  expenses,
  income,
  incomeAfterDeduction,
}: IncomeStatCardProps) {
  return (
    <Card>
      <AppText size="lg" weight="bold">
        {title}
      </AppText>
      <LabeledValue label="収入" value={formatYen(revenue)} strong />
      <LabeledValue label="経費" value={formatYen(expenses)} />
      <LabeledValue label="所得（控除前）" value={formatYen(income)} />
      <LabeledValue label="青色申告特別控除後" value={formatYen(incomeAfterDeduction)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  col: { gap: space.md },
});
