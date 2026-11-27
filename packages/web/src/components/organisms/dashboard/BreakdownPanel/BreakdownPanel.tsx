import { CategoryBreakdown, categoryBreakdown, filterYear, Transaction } from "@etax/shared";
import { useMemo } from "react";
import { Card, Col, Row, Text } from "@components/atoms";
import { formatCompactYen, formatYen } from "@utils";
import styles from "./BreakdownPanel.css";

export interface BreakdownPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
}

/**
 * 収入の内訳・支出の内訳（勘定科目ごとの円グラフ）。
 * 選択中の年の取引を科目で集計し、金額の大きい順にドーナツ＋凡例で並べる。
 * 集計範囲は確定申告画面と合わせて事業＋不動産だけにする。口座の生の出入り
 * （チャージ・振替・投資・カード決済などの「その他」区分＝資金の移動）は
 * 収支ではないので混ぜず、無視する（申告の数字と食い違うため）。
 * その年の取引が無い年は表示しない。
 */
export const BreakdownPanel = ({ transactions, year }: BreakdownPanelProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  // 金額は事業分（家事按分後）で集計し、申告画面の内訳と揃える。
  const income = useMemo(() => categoryBreakdown(yearTransactions, "income"), [yearTransactions]);
  const expenses = useMemo(
    () => categoryBreakdown(yearTransactions, "expense"),
    [yearTransactions],
  );
  if (yearTransactions.length === 0) return null;

  return (
    <Card>
      <Col gap="md">
        <Text variant="sectionTitle">収入・支出の内訳 — {year}年</Text>
        <div className={styles.grid}>
          <BreakdownColumn title="収入の内訳" breakdown={income} />
          <BreakdownColumn title="支出の内訳" breakdown={expenses} />
        </div>
      </Col>
    </Card>
  );
};

interface BreakdownColumnProps {
  title: string;
  breakdown: CategoryBreakdown;
}

const BreakdownColumn = ({ title, breakdown }: BreakdownColumnProps) => {
  const { rows, total, slices: arcs } = breakdown;

  return (
    <Col gap="sm">
      <Text variant="statLabel">{title}</Text>
      {rows.length === 0 ? (
        <Text variant="muted">なし</Text>
      ) : (
        <>
          <div className={styles.chartWrap}>
            <svg className={styles.donut} viewBox="0 0 120 120" role="img" aria-label={title}>
              <g transform="rotate(-90 60 60)">
                {arcs.map((arc) => (
                  <circle
                    key={arc.key}
                    className={
                      arc.colorIndex === null ? styles.sliceOther : styles.slicePalette[arc.colorIndex]
                    }
                    cx="60"
                    cy="60"
                    r="46"
                    pathLength={100}
                    strokeDasharray={`${Math.max(arc.share - (arcs.length > 1 ? 0.7 : 0), 0.4)} ${
                      100 - arc.share
                    }`}
                    strokeDashoffset={-arc.start}
                  />
                ))}
              </g>
              <text className={styles.centerLabel} x="60" y="56">
                合計
              </text>
              <text className={styles.centerValue} x="60" y="74">
                {formatCompactYen(total)}
              </text>
            </svg>
          </div>
          {arcs.map((arc) => (
            <Row key={arc.key} gap="sm" align="center">
              <span
                className={
                  arc.colorIndex === null ? styles.swatchOther : styles.swatchPalette[arc.colorIndex]
                }
              />
              <Text className={styles.rowName}>{arc.category}</Text>
              <Text className={styles.rowAmount}>{formatYen(arc.amount)}</Text>
              <Text variant="muted" className={styles.rowShare}>
                {Math.round(arc.share)}%
              </Text>
            </Row>
          ))}
        </>
      )}
    </Col>
  );
};
