import { Button, Input, Row, Text } from "@components/atoms";
import styles from "./DeductionPanel.css";

/**
 * deductionFields.tsx — 控除画面の入力部品（金額・空欄可金額・切替ボタン）。
 */

export function toAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

interface AmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** 単位表示（人数は「人」）。金額は表示しない（円は内訳側で付ける）。 */
  suffix?: string;
}

export const AmountField = ({ label, value, onChange, suffix }: AmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">
        {label}
        {suffix ? `（${suffix}）` : ""}
      </Text>
    </div>
    <Input
      className={styles.fieldInput}
      type="number"
      value={value}
      onChange={(e) => onChange(toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);

interface NullableAmountFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

export const NullableAmountField = ({ label, value, onChange }: NullableAmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldInput}
      type="number"
      value={value ?? ""}
      placeholder="対象がいなければ空欄"
      onChange={(e) => onChange(e.target.value === "" ? null : toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);

interface ToggleButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

export const ToggleButton = ({ label, active, onClick }: ToggleButtonProps) => (
  <Button variant={active ? "tabActive" : "tab"} size="sm" onClick={onClick}>
    {label}
    {active ? " ✓" : ""}
  </Button>
);
