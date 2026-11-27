import { StyleSheet, TextInput } from "react-native";
import { colors, fontFamily, radius } from "@/theme";
import { formatNumber, parseAmount } from "@/utils";

export interface MoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}

/** ラベルなしの金額入力（表形式のセル内などで使う）。 */
export function MoneyInput({ value, onChange, accessibilityLabel }: MoneyInputProps) {
  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      inputMode="numeric"
      keyboardType="number-pad"
      onChangeText={(text) => onChange(parseAmount(text))}
      placeholder="0"
      placeholderTextColor={colors.muted}
      style={moneyInputStyles.input}
      value={value === 0 ? "" : formatNumber(value)}
    />
  );
}

/** 表形式のセル内の金額入力の見た目（符号つきの入力と共有する）。 */
export const moneyInputStyles = StyleSheet.create({
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: "right",
  },
});
