import { filterYear, Transaction } from "@etax/shared";
import { useMemo } from "react";
import { Card, Col, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./BreakdownPanel.css";

interface CategoryAmount {
  category: string;
  amount: number;
}

// 円グラフに出すスライスの上限。超えた分は「その他」にまとめる。
const MAX_SLICES = 6;

export interface BreakdownPanelProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
}

/**
 * 収入の内訳・支出の内訳（勘定科目ごとの円グラフ）。
 * 選択中の年の取引を科目で集計し、金額の大きい順にドーナツ＋凡例で並べる。
 * その年の取引が無い年は表示しない。
 */
export const BreakdownPanel = ({ transactions, year }: BreakdownPanelProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);

  const income = useMemo(
    () => sumByCategory(yearTransactions.filter((t) => t.amount > 0), false),
    [yearTransactions],
  );
  const expenses = useMemo(
    () => sumByCategory(yearTransactions.filter((t) => t.amount < 0), true),
    [yearTransactions],
  );

  if (yearTransactions.length === 0) return null;

  const incomeTotal = income.reduce((sum, row) => sum + row.amount, 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Card>
      <Col gap="md">
        <Text variant="sectionTitle">収入・支出の内訳 — {year}年</Text>
        <div className={styles.grid}>
          <BreakdownColumn title="収入の内訳" rows={income} total={incomeTotal} kind="income" />
          <BreakdownColumn title="支出の内訳" rows={expenses} total={expenseTotal} kind="expense" />
        </div>
      </Col>
    </Card>
  );
};

interface BreakdownColumnProps {
  title: string;
  rows: readonly CategoryAmount[];
  total: number;
  kind: "income" | "expense";
}

const BreakdownColumn = ({ title, rows, total, kind }: BreakdownColumnProps) => {
  const slices = groupSlices(rows);
  const sliceClasses = kind === "income" ? styles.sliceIncome : styles.sliceExpense;
  const swatchClasses = kind === "income" ? styles.swatchIncome : styles.swatchExpense;
  let accumulated = 0;
  const arcs = slices.map((slice) => {
    const share = total > 0 ? (slice.amount / total) * 100 : 0;
    const start = accumulated;
    accumulated += share;
    return { ...slice, share, start };
  });

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
                {arcs.map((arc, index) => (
                  <circle
                    key={arc.category}
                    className={sliceClasses[index]}
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
          {arcs.map((arc, index) => (
            <Row key={arc.category} gap="sm" align="center">
              <span className={swatchClasses[index]} />
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

// 科目ごとに合計する。支出（マイナス）は絶対値で積む。金額の大きい順。
function sumByCategory(transactions: Transaction[], absolute: boolean): CategoryAmount[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    const amount = absolute ? Math.abs(Math.trunc(t.amount)) : Math.trunc(t.amount);
    totals.set(t.category, (totals.get(t.category) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

// スライス上限を超えた科目は「その他」に合算する。
function groupSlices(rows: readonly CategoryAmount[]): CategoryAmount[] {
  if (rows.length <= MAX_SLICES) return [...rows];
  const head = rows.slice(0, MAX_SLICES - 1);
  const rest = rows.slice(MAX_SLICES - 1);
  const restTotal = rest.reduce((sum, row) => sum + row.amount, 0);
  return [...head, { category: "その他", amount: restTotal }];
}

// 円グラフ中央用の短い金額（万円単位）。
function formatCompactYen(amount: number): string {
  if (Math.abs(amount) < 10000) return formatYen(amount);
  return `¥${Math.round(amount / 10000).toLocaleString("ja-JP")}万`;
}
