import { StyleSheet, View } from "react-native";
import { LedgerTransaction } from "@/api";
import { AppText, BouncePressable, Chip } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatDate, formatYen } from "@/utils";
import { incomeTypeLabel } from "../options";

export interface LedgerRowProps {
  row: LedgerTransaction;
  onPress: (row: LedgerTransaction) => void;
}

/** 帳簿の取引1行。タップで詳細シートを開く。 */
export function LedgerRow({ row, onPress }: LedgerRowProps) {
  return (
    <BouncePressable onPress={() => onPress(row)} style={styles.row} pressScale={0.98}>
      <View style={styles.main}>
        <AppText size="sm" tone="muted">{formatDate(row.date)}</AppText>
        <AppText size="md" weight="medium" numberOfLines={2}>{row.description || "（摘要なし）"}</AppText>
        <View style={styles.chips}>
          <Chip label={row.category} tone="accent" />
          <Chip label={incomeTypeLabel(row.income_type)} />
          {row.tax_category ? <Chip label={row.tax_category} /> : null}
        </View>
      </View>
      <AppText size="md" weight="bold" tone={row.amount < 0 ? "negative" : "positive"}>
        {formatYen(row.amount)}
      </AppText>
    </BouncePressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", gap: space.sm, alignItems: "flex-start",
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.md, padding: space.md,
  },
  main: { flex: 1, gap: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
