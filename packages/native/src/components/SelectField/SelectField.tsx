import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";
import { AppText } from "../AppText";
import { BouncePressable } from "../BouncePressable";
import { Sheet } from "../Sheet";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
}

/** タップでボトムシートの選択肢を開くセレクト欄。 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <View style={styles.wrap}>
      <AppText size="sm" weight="semibold" tone="subtle">
        {label}
      </AppText>
      <BouncePressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? value}`}
        onPress={() => setOpen(true)}
        style={styles.box}
        pressScale={0.98}
      >
        <AppText size="md" numberOfLines={1} style={styles.value}>
          {current?.label ?? value}
        </AppText>
        <AppText size="md" tone="muted">
          ▾
        </AppText>
      </BouncePressable>
      {hint ? (
        <AppText size="xs" tone="muted">
          {hint}
        </AppText>
      ) : null}
      <Sheet onClose={() => setOpen(false)} title={label} visible={open}>
        <FlatList
          data={[...options]}
          keyExtractor={(item) => item.value}
          style={styles.list}
          renderItem={({ item }) => (
            <BouncePressable
              accessibilityRole="button"
              onPress={() => {
                onChange(item.value);
                setOpen(false);
              }}
              pressScale={0.98}
              style={[styles.option, item.value === value ? styles.optionActive : null]}
            >
              <AppText
                numberOfLines={1}
                weight={item.value === value ? "bold" : "regular"}
                tone={item.value === value ? "accent" : "text"}
              >
                {item.label}
              </AppText>
            </BouncePressable>
          )}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  box: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  value: { flex: 1 },
  list: { maxHeight: 380 },
  option: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: radius.sm },
  optionActive: { backgroundColor: colors.accentSoft },
});
