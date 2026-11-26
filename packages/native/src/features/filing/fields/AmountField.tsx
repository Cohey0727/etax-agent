import { MoneyField } from "@/components";
import { formatNumber, parseAmount } from "@/utils";

export interface AmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** 単位表示（人数は「人」）。ラベルの末尾に付ける。 */
  suffix?: string;
  hint?: string;
}

/** ラベル付き金額入力。0 のときは空欄で出し、入力は数値として返す。 */
export function AmountField({ label, value, onChange, suffix, hint }: AmountFieldProps) {
  return (
    <MoneyField
      label={suffix ? `${label}（${suffix}）` : label}
      hint={hint}
      value={value === 0 ? "" : formatNumber(value)}
      onChangeValue={(text) => onChange(parseAmount(text))}
    />
  );
}

export interface NullableAmountFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
}

/** 空欄（未入力 = null）と 0 を区別する金額入力。 */
export function NullableAmountField({ label, value, onChange, hint }: NullableAmountFieldProps) {
  return (
    <MoneyField
      label={label}
      hint={hint}
      placeholder="対象がいなければ空欄"
      value={value === null ? "" : formatNumber(value)}
      onChangeValue={(text) => onChange(text === "" ? null : parseAmount(text))}
    />
  );
}
