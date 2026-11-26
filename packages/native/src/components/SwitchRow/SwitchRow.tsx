import { StyleSheet, Switch, View } from "react-native";
import { colors } from "@/theme";
import { AppText } from "../AppText";

export interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** ラベル＋スイッチの行。 */
export function SwitchRow({ label, description, value, onChange }: SwitchRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <AppText size="md" weight="medium">
          {label}
        </AppText>
        {description ? (
          <AppText size="xs" tone="muted">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        onValueChange={onChange}
        thumbColor="#ffffff"
        trackColor={{ false: colors.borderStrong, true: colors.accent }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  texts: { flex: 1, gap: 2 },
});
