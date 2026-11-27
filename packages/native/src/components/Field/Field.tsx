import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { colors, fontFamily, radius } from "@/theme";
import { AppText } from "../AppText";

export interface FieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** 補足説明（任意）。 */
  hint?: string;
}

/** ラベル付きテキスト入力。 */
export function Field({ label, hint, ...rest }: FieldProps) {
  return (
    <View style={styles.wrap}>
      <AppText size="sm" weight="semibold" tone="subtle">
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...rest}
      />
      {hint ? (
        <AppText size="xs" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export interface MoneyFieldProps {
  label: string;
  /** 表示する文字列（桁区切り済みでも生の数字でもよい）。 */
  value: string;
  /** 入力された文字列をそのまま渡す。数値への変換は parseAmount で行う。 */
  onChangeValue: (value: string) => void;
  hint?: string;
  placeholder?: string;
}

/** 金額入力。数字キーパッドで受ける。 */
export function MoneyField({ label, value, onChangeValue, hint, placeholder }: MoneyFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      inputMode="numeric"
      keyboardType="number-pad"
      onChangeText={onChangeValue}
      placeholder={placeholder ?? "0"}
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  input: {
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
