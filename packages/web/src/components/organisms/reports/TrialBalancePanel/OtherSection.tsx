import { IncomeType } from "@etax/shared";
import { Card, Col, Text } from "@components/atoms";
import { TrialBalanceOther } from "@types";
import { formatYen } from "@utils";
import styles from "./TrialBalancePanel.css";

export interface OtherSectionProps {
  current: TrialBalanceOther;
  previous: TrialBalanceOther;
  onDrillDown: (incomeType: IncomeType, categories: string[]) => void;
}

/**
 * 「その他」区分（資金移動など）の参考集計。決算書には載らないため
 * 損益計算書とは分けて出す。科目から帳簿へドリルダウンできる。
 */
export const OtherSection = ({ current, previous, onDrillDown }: OtherSectionProps) => {
  if (current.revenue === 0 && current.expenses === 0 && previous.revenue === 0 && previous.expenses === 0) {
    return null;
  }
  const lines = [
    ...current.revenue_lines.map((line) => ({ ...line, sign: 1 })),
    ...current.expense_lines.map((line) => ({ ...line, sign: -1 })),
  ];
  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">その他（資金移動など・決算書対象外）</Text>
        <div className={styles.tableScroll}>
          <div className={`${styles.plRow} ${styles.headRow}`}>
            <span>科目</span>
            <span className={styles.cell}>入金</span>
            <span className={styles.cell}>出金</span>
            <span className={styles.cell}>差引</span>
          </div>
          {lines.map((line) => (
            <div key={`${line.sign}-${line.category}`} className={styles.plRow}>
              <button
                type="button"
                className={styles.categoryButton}
                onClick={() => onDrillDown("other", line.categories)}
              >
                {line.category}
              </button>
              <span className={styles.cell}>{line.sign > 0 ? formatYen(line.amount) : "―"}</span>
              <span className={styles.cell}>{line.sign < 0 ? formatYen(line.amount) : "―"}</span>
              <span className={styles.cell}>{formatYen(line.sign * line.amount)}</span>
            </div>
          ))}
          <div className={`${styles.plRow} ${styles.totalRow}`}>
            <span>合計</span>
            <span className={styles.cell}>{formatYen(current.revenue)}</span>
            <span className={styles.cell}>{formatYen(current.expenses)}</span>
            <span className={styles.cell}>{formatYen(current.revenue - current.expenses)}</span>
          </div>
        </div>
      </Col>
    </Card>
  );
};
