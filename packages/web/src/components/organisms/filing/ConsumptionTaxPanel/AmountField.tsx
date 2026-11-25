import { Input, Row, Text } from "@components/atoms";
import { toAmount } from "./consumptionTaxHelpers";
import styles from "./ConsumptionTaxPanel.css";

interface AmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

/** ラベル＋数値入力の1行（消費税画面の手入力項目用）。 */
export const AmountField = ({ label, value, onChange }: AmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldNumber}
      type="number"
      value={value}
      onChange={(e) => onChange(toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);
