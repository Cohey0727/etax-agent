import { IncomeTaxResult } from "@etax/shared";
import { Card, Col, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./TaxSummary.css";

export interface TaxSummaryProps {
  /** 控除タブと同じ入力で計算した所得税の結果 */
  taxResult: IncomeTaxResult;
}

/**
 * 「控除・計算」行の直下に置く税額の要約。控除を入力したら、その結果である
 * 税額の数字を真下で確認して、そのまま「済み」にできるようにする。
 */
export const TaxSummary = ({ taxResult }: TaxSummaryProps) => {
  const taxRows: readonly { label: string; amount: number }[] = [
    { label: "所得控除", amount: taxResult.deductionsTotal },
    { label: "課税所得", amount: taxResult.taxableIncome },
    { label: "所得税額（税額控除前）", amount: taxResult.incomeTaxBase },
    { label: "税額控除", amount: taxResult.taxCreditsTotal },
    { label: "復興特別所得税", amount: taxResult.reconstructionTax },
  ];

  return (
    <Col gap="md">
      <div className={styles.statGrid}>
        <Card>
          <Col gap="none">
            <Text variant="statLabel">所得税額（確定税額）</Text>
            <Text variant="statValue">{formatYen(taxResult.finalTax)}</Text>
          </Col>
        </Card>
      </div>
      <Col gap="sm">
        {taxRows.map((row) => (
          <Row key={row.label} align="center" justify="spaceBetween">
            <Text variant="muted">{row.label}</Text>
            <Text className={styles.amount}>{formatYen(row.amount)}</Text>
          </Row>
        ))}
        <Row align="center" justify="spaceBetween" className={styles.totalRow}>
          <Text>所得税額（確定税額）</Text>
          <Text className={styles.amount}>{formatYen(taxResult.finalTax)}</Text>
        </Row>
      </Col>
      <Text variant="muted">
        源泉徴収税額・予定納税額との精算（申告納税額）は提出パネルで確認します。
      </Text>
    </Col>
  );
};
