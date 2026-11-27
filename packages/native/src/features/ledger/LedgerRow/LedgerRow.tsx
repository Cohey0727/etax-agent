import { ledgerIncomeTypeLabel } from "@etax/shared";
import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { LedgerTransaction } from "@/api";
import { AppText, BouncePressable, Chip } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatDate, formatYen } from "@/utils";

export interface LedgerRowProps {
  row: LedgerTransaction;
  onPress: (row: LedgerTransaction) => void;
}

/** 帳簿の取引1行。タップで詳細シートを開く。行が多い帳簿でも再描画を抑えるためメモ化する。 */
export const LedgerRow = memo(function LedgerRow({ row, onPress }: LedgerRowProps) {
  return (
    <BouncePressable onPress={() => onPress(row)} style={styles.row} pressScale={0.98}>
      <View style={styles.main}>
        <AppText size="sm" tone="muted">{formatDate(row.date)}</AppText>
        <AppText size="md" weight="medium" numberOfLines={2}>{row.description || "（摘要なし）"}</AppText>
        <View style={styles.chips}>
          <Chip label={row.category} tone="accent" />
          <Chip label={ledgerIncomeTypeLabel(row.income_type)} />
          {row.tax_category ? <Chip label={row.tax_category} /> : null}
        </View>
      </View>
      <AppText size="md" weight="bold" tone={row.amount < 0 ? "negative" : "positive"}>
        {formatYen(row.amount)}
      </AppText>
    </BouncePressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", gap: space.sm, alignItems: "flex-start",
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: space.md,
  },
  main: { flex: 1, gap: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
