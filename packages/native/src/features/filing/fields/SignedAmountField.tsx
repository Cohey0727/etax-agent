import { useState } from "react";
import { Platform, TextInput } from "react-native";
import { Field } from "@/components";
import { colors } from "@/theme";
import { formatNumber } from "@/utils";
import { moneyInputStyles } from "./MoneyInput";
import { parseSignedAmount } from "./signedAmount";

/** iOS の数字キーパッドには「-」が無いので、記号つきのキーボードを出す。 */
const SIGNED_KEYBOARD = Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric";

/**
 * 符号つき金額の入力中の文字列。「-」だけ・桁区切りの途中のように数値にすると
 * 消えてしまう文字列を、入力している間だけ下書きとして持つ。
 */
function useSignedAmountDraft(value: number, onChange: (value: number) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? (value === 0 ? "" : formatNumber(value)),
    onChangeText: (text: string) => {
      setDraft(text);
      onChange(parseSignedAmount(text));
    },
    onBlur: () => setDraft(null),
  };
}

export interface SignedAmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}

/** 赤字（負の金額）も入れられるラベル付き金額入力。 */
export function SignedAmountField({ label, value, onChange, hint }: SignedAmountFieldProps) {
  const input = useSignedAmountDraft(value, onChange);
  return (
    <Field
      label={label}
      hint={hint}
      keyboardType={SIGNED_KEYBOARD}
      placeholder="0"
      {...input}
    />
  );
}

export interface SignedMoneyInputProps {
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
}

/** 赤字（負の金額）も入れられる、ラベルなしの金額入力（表形式のセル内などで使う）。 */
export function SignedMoneyInput({ value, onChange, accessibilityLabel }: SignedMoneyInputProps) {
  const input = useSignedAmountDraft(value, onChange);
  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      keyboardType={SIGNED_KEYBOARD}
      placeholder="0"
      placeholderTextColor={colors.muted}
      style={moneyInputStyles.input}
      {...input}
    />
  );
}
