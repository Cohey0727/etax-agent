import { Input, Row, Text } from "@components/atoms";
import styles from "./ExpandedIncomePanel.css";

/** 金額入力の文字列を数値へ寄せる（空・不正は 0）。 */
export function toAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

interface AmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

/** ラベル＋金額入力の1行（MiscIncomePanel の AmountField と同じ並び）。 */
export const AmountField = ({ label, value, onChange }: AmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
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

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** ラベル＋テキスト入力の1行（証券会社名・支店名用）。 */
export const TextField = ({ label, value, onChange }: TextFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldText}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  </Row>
);

interface ResultRowProps {
  label: string;
  value: string;
}

/** 計算結果の表示行（ラベル＋右寄せの値）。 */
export const ResultRow = ({ label, value }: ResultRowProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Text className={styles.resultValue}>{value}</Text>
  </Row>
);
