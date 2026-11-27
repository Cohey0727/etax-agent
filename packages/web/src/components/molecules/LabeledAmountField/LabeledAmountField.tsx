import { Input, Row, Text } from "@components/atoms";
import { toAmount } from "@utils/amountInput";
import styles from "./LabeledAmountField.css";

export interface LabeledAmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** ラベルの末尾に添える単位（人数の「人」など）。金額には付けない。 */
  suffix?: string;
}

/**
 * ラベル列つきの金額・人数の入力欄（1行）。ラベル列の幅をそろえて、
 * 縦に並べたときに入力欄の左端が揃うようにする。入力は整数で返す。
 */
export const LabeledAmountField = ({ label, value, onChange, suffix }: LabeledAmountFieldProps) => (
  <Row gap="sm">
    <Row align="center" className={styles.label}>
      <Text variant="muted">
        {label}
        {suffix ? `（${suffix}）` : ""}
      </Text>
    </Row>
    <Input
      className={styles.input}
      type="number"
      value={value}
      onChange={(e) => onChange(toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);
