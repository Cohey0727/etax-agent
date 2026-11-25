import { Card, Col, Text } from "@components/atoms";
import { CashFlowMonth } from "@types";
import { formatYen } from "@utils";
import styles from "./CashFlowPanel.css";

export interface BalanceChartProps {
  months: CashFlowMonth[];
}

/**
 * 月末残高の推移（バーチャート）。ゼロを基準線として、正の残高は
 * 上向き、負の残高は下向きのバーで示す。高さは表示窓内の最大・
 * 最小に対する割合で決める（決定的な表示計算のみ）。
 */
export const BalanceChart = ({ months }: BalanceChartProps) => {
  const max = Math.max(0, ...months.map((m) => m.closing_balance));
  const min = Math.min(0, ...months.map((m) => m.closing_balance));
  const range = max - min;
  const zeroRatio = range > 0 ? max / range : 1;
  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">残高推移</Text>
        <div className={styles.chart}>
          {months.map((row) => {
            const heightRatio = range > 0 ? Math.abs(row.closing_balance) / range : 0;
            const topRatio = row.closing_balance >= 0 ? zeroRatio - heightRatio : zeroRatio;
            return (
              <div key={row.month} className={styles.chartColumn}>
                <div style={{ height: `${topRatio * 100}%` }} />
                <div
                  className={row.closing_balance >= 0 ? styles.chartBar : styles.chartBarNegative}
                  style={{ height: `${heightRatio * 100}%` }}
                  title={`${row.month}: ${formatYen(row.closing_balance)}`}
                />
                <div className={styles.chartLabel}>
                  {Number(row.month.slice(5, 7))}月
                </div>
              </div>
            );
          })}
        </div>
        <Text variant="caption">
          各月の月末残高です。マイナスの月は残高不足を示します。
        </Text>
      </Col>
    </Card>
  );
};
