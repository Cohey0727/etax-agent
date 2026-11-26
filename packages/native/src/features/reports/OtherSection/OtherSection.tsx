import { StyleSheet, View } from "react-native";
import { TrialBalanceOther } from "@/api";
import { AppText, Card } from "@/components";
import { formatYen } from "@/utils";
import { tableStyles } from "../tableStyles";

export interface OtherSectionProps {
  current: TrialBalanceOther;
  previous: TrialBalanceOther;
}

/** 「その他」区分（資金移動など）の参考集計。決算書には載らないため損益計算書とは分けて出す。 */
export function OtherSection({ current, previous }: OtherSectionProps) {
  if (
    current.revenue === 0 &&
    current.expenses === 0 &&
    previous.revenue === 0 &&
    previous.expenses === 0
  ) {
    return null;
  }
  const lines = [
    ...current.revenue_lines.map((line) => ({ ...line, sign: 1 })),
    ...current.expense_lines.map((line) => ({ ...line, sign: -1 })),
  ];
  return (
    <Card>
      <AppText size="sm" weight="semibold" tone="subtle">
        その他（資金移動など・決算書対象外）
      </AppText>
      <View>
        <View style={[tableStyles.row, tableStyles.headRow]}>
          <AppText size="sm" weight="bold" style={tableStyles.label}>科目</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>入金</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>出金</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>差引</AppText>
        </View>
        {lines.map((line) => (
          <View key={`${line.sign}-${line.category}`} style={tableStyles.row}>
            <AppText size="sm" style={tableStyles.label}>{line.category}</AppText>
            <AppText size="sm" style={styles.cell}>{line.sign > 0 ? formatYen(line.amount) : "―"}</AppText>
            <AppText size="sm" style={styles.cell}>{line.sign < 0 ? formatYen(line.amount) : "―"}</AppText>
            <AppText size="sm" style={styles.cell}>{formatYen(line.sign * line.amount)}</AppText>
          </View>
        ))}
        <View style={[tableStyles.row, tableStyles.totalRow]}>
          <AppText size="sm" weight="bold" style={tableStyles.label}>合計</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>{formatYen(current.revenue)}</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>{formatYen(current.expenses)}</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>
            {formatYen(current.revenue - current.expenses)}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  cell: { width: 92, textAlign: "right" },
});
