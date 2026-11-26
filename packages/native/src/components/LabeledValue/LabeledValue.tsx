import { StyleSheet, View } from "react-native";
import { AppText } from "../AppText";

export interface LabeledValueProps {
  label: string;
  value: string;
  /** 金額などを強調する行。 */
  strong?: boolean;
}

/** ラベルと値の1行（集計表示用）。 */
export function LabeledValue({ label, value, strong }: LabeledValueProps) {
  return (
    <View style={styles.row}>
      <AppText size="sm" tone="subtle" style={styles.label}>
        {label}
      </AppText>
      <AppText size={strong ? "lg" : "md"} weight={strong ? "bold" : "medium"} style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 2,
  },
  // ラベルは潰さない。長い値は値側が折り返して収める。
  label: { flexShrink: 0 },
  value: { flex: 1, flexShrink: 1, textAlign: "right" },
});
