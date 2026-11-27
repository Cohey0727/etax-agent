import { Input, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./ExpandedIncomePanel.css";

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
  amount: number;
}

/** 計算結果の金額の表示行（ラベル＋右寄せの金額）。 */
export const ResultRow = ({ label, amount }: ResultRowProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Text className={styles.resultValue}>{formatYen(amount)}</Text>
  </Row>
);
