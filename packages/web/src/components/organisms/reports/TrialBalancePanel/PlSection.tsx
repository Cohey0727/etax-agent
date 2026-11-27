import { IncomeType, trialBalancePlRows } from "@etax/shared";
import { Card, Col, Text } from "@components/atoms";
import { TrialBalancePl } from "@types";
import { formatYen } from "@utils";
import styles from "./TrialBalancePanel.css";

export interface PlSectionProps {
  title: string;
  year: number;
  incomeType: IncomeType;
  current: TrialBalancePl;
  previous: TrialBalancePl;
  onDrillDown: (incomeType: IncomeType, categories: string[]) => void;
}

/**
 * 損益計算書（1区分分）。数値はXTXの青色申告決算書と一致する集計を
 * そのまま表示し、前年との比較（増減）も並べる。科目名をクリックすると
 * 帳簿がその科目でフィルタされた状態で開く。
 */
export const PlSection = ({
  title,
  year,
  incomeType,
  current,
  previous,
  onDrillDown,
}: PlSectionProps) => {
  const rows = trialBalancePlRows(current, previous);
  const isEmpty =
    current.revenue === 0 &&
    current.expenses === 0 &&
    current.purchases === 0 &&
    previous.revenue === 0 &&
    previous.expenses === 0 &&
    previous.purchases === 0;
  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">{title}</Text>
        {isEmpty ? (
          <Text variant="muted">この区分の取引はありません。</Text>
        ) : (
          <div className={styles.tableScroll}>
            <div className={`${styles.plRow} ${styles.headRow}`}>
              <span>科目</span>
              <span className={styles.cell}>{year}年</span>
              <span className={styles.cell}>{year - 1}年</span>
              <span className={styles.cell}>増減</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.key}
                className={`${styles.plRow} ${
                  row.kind === "total"
                    ? styles.totalRow
                    : row.kind === "subtotal"
                      ? styles.subtotalRow
                      : ""
                }`}
              >
                {row.categories ? (
                  <button
                    type="button"
                    className={styles.categoryButton}
                    onClick={() => onDrillDown(incomeType, row.categories ?? [])}
                  >
                    {row.label}
                  </button>
                ) : (
                  <span>{row.label}</span>
                )}
                <span className={styles.cell}>{formatYen(row.current)}</span>
                <span className={styles.cell}>{formatYen(row.previous)}</span>
                <span className={styles.cell}>{formatDiff(row.current - row.previous)}</span>
              </div>
            ))}
          </div>
        )}
      </Col>
    </Card>
  );
};

function formatDiff(diff: number): string {
  if (diff === 0) return "―";
  return diff > 0 ? `+${formatYen(diff)}` : formatYen(diff);
}
