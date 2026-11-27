import { Input, Row, Text } from "@components/atoms";
import styles from "./AgriculturePanel.css";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/** ラベル＋テキスト入力の1行。 */
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
