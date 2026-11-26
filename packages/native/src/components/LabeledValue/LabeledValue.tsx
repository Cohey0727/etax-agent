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
      <AppText size={strong ? "lg" : "md"} weight={strong ? "bold" : "medium"}>
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
  label: { flex: 1 },
});
