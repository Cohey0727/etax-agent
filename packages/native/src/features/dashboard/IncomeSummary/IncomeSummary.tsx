import { BlueDeduction, FilingType, IncomeBreakdown, blueDeductionCaps } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, Card, LabeledValue } from "@/components";
import { space } from "@/theme";
import { formatYen } from "@/utils";

export interface IncomeSummaryProps {
  breakdown: IncomeBreakdown;
  blue: BlueDeduction;
  filingType: FilingType;
  realEstateBusinessScale: boolean;
}

/** 事業所得・不動産所得と青色申告特別控除のサマリー。 */
export function IncomeSummary({
  breakdown,
  blue,
  filingType,
  realEstateBusinessScale,
}: IncomeSummaryProps) {
  const caps = blueDeductionCaps({ filingType, realEstateBusinessScale });
  const pooled = filingType === "blue10" || realEstateBusinessScale || filingType === "white";
  const realEstateLabel = pooled ? "不動産分" : `不動産分（上限${formatCap(caps.realEstate)}）`;
  const businessLabel = pooled ? "事業分" : `事業分（上限${formatCap(caps.business)}）`;
  const totalLabel = filingType === "white" ? "合計" : `合計（最大${formatCap(caps.total)}）`;
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
        <LabeledValue label={realEstateLabel} value={formatYen(blue.realEstate)} />
        <LabeledValue label={businessLabel} value={formatYen(blue.business)} />
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
