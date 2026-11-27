import { Transaction, yearlyIncomeTotals } from "@etax/shared";
import { Fragment, useMemo } from "react";
import { Card, Col, Row, Text } from "@components/atoms";
import { formatCompactYen, formatYen } from "@utils";
import styles from "./YearlyTrendPanel.css";

type SeriesKey = "revenue" | "expenses" | "balance";

/** グラフの系列（並び・凡例・色クラス）。収支だけマイナスがありうる。 */
const SERIES: readonly {
  key: SeriesKey;
  label: string;
  barClass: string;
  swatchClass: string;
}[] = [
  { key: "revenue", label: "売上", barClass: styles.barRevenue, swatchClass: styles.swatchRevenue },
  { key: "expenses", label: "経費", barClass: styles.barExpense, swatchClass: styles.swatchExpense },
  { key: "balance", label: "収支", barClass: styles.barBalance, swatchClass: styles.swatchBalance },
];

// グラフの寸法。1年度=3本の棒＋余白で 150px 幅にする。
const GROUP_PITCH = 150;
const BAR_WIDTH = 30;
const BAR_GAP = 8;
const CHART_HEIGHT = 196;
const BASELINE_Y = 150;
const TOP_Y = 28;

export interface YearlyTrendPanelProps {
  transactions: Transaction[];
}

/**
 * 年度を跨ぐ推移（売上・経費・収支）。全年度の取引から年度ごとに
 * 事業＋不動産の集計を作り、棒グラフ＋金額表で並べる。
 * 資金の移動（その他区分）は収支ではないので含めない（他画面と同じ範囲）。
 */
export const YearlyTrendPanel = ({ transactions }: YearlyTrendPanelProps) => {
  const years = useMemo(() => yearlyIncomeTotals(transactions), [transactions]);

  if (years.length === 0) return null;

  const maxPositive = Math.max(1, ...years.flatMap((y) => [y.revenue, y.expenses, Math.max(y.balance, 0)]));
  const maxNegative = Math.max(1, ...years.map((y) => Math.max(-y.balance, 0)));
  const posScale = (BASELINE_Y - TOP_Y) / maxPositive;
  const negScale = (CHART_HEIGHT - 24 - BASELINE_Y) / maxNegative;
  const width = years.length * GROUP_PITCH + 16;

  return (
    <Card>
      <Col gap="md">
        <Row gap="md" align="center" justify="spaceBetween" wrap>
          <Text variant="sectionTitle">年度ごとの推移</Text>
          <Row gap="md" align="center">
            {SERIES.map((series) => (
              <Row key={series.key} gap="sm" align="center">
                <span className={series.swatchClass} />
                <Text variant="muted">{series.label}</Text>
              </Row>
            ))}
          </Row>
        </Row>
        <div className={styles.chartWrap}>
          <svg
            width={width}
            height={CHART_HEIGHT}
            viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
            role="img"
            aria-label="年度ごとの売上・経費・収支の推移"
          >
            <line className={styles.axis} x1="0" y1={BASELINE_Y} x2={width} y2={BASELINE_Y} />
            {years.map((totals, yearIndex) => {
              const groupX = 8 + yearIndex * GROUP_PITCH;
              return (
                <g key={totals.year}>
                  {SERIES.map((series, seriesIndex) => {
                    const value = totals[series.key];
                    const x = groupX + seriesIndex * (BAR_WIDTH + BAR_GAP);
                    const center = x + BAR_WIDTH / 2;
                    if (value >= 0) {
                      const height = Math.max(value * posScale, value > 0 ? 2 : 0);
                      return (
                        <g key={series.key}>
                          <rect
                            className={series.barClass}
                            x={x}
                            y={BASELINE_Y - height}
                            width={BAR_WIDTH}
                            height={height}
                            rx="4"
                          />
                          <text className={styles.valueLabel} x={center} y={BASELINE_Y - height - 5}>
                            {formatCompactYen(value)}
                          </text>
                        </g>
                      );
                    }
                    const height = Math.max(-value * negScale, 2);
                    return (
                      <g key={series.key}>
                        <rect
                          className={styles.barBalanceNegative}
                          x={x}
                          y={BASELINE_Y}
                          width={BAR_WIDTH}
                          height={height}
                          rx="4"
                        />
                        <text className={styles.valueLabel} x={center} y={BASELINE_Y + height + 13}>
                          {formatCompactYen(value)}
                        </text>
                      </g>
                    );
                  })}
                  <text className={styles.yearLabel} x={groupX + 53} y={BASELINE_Y + 20}>
                    {totals.year}年
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.headCell}>年度</th>
              <th className={styles.headCellRight}>売上</th>
              <th className={styles.headCellRight}>経費</th>
              <th className={styles.headCellRight}>収支</th>
            </tr>
          </thead>
          <tbody>
            {years.map((totals) => (
              <tr key={totals.year}>
                <td className={styles.cellYear}>{totals.year}年</td>
                <td className={styles.cellValue}>{formatYen(totals.revenue)}</td>
                <td className={styles.cellValue}>{formatYen(totals.expenses)}</td>
                <td className={styles.cellBalance}>{formatYen(totals.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Col>
    </Card>
  );
};
