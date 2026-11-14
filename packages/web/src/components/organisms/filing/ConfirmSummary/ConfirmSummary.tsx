import { computeCorrectedFigures, filterYear, Transaction } from "@etax/shared";
import { useMemo } from "react";
import { Col, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { formatYen } from "@utils";
import styles from "./ConfirmSummary.css";

interface CategoryAmount {
  category: string;
  amount: number;
}

export interface ConfirmSummaryProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
}

/**
 * 確定申告「確認」ステップの中身。帳簿の合計（事業／不動産の収入・経費、
 * 青色申告特別控除、所得合計）と、勘定科目ごとの内訳（収入／支出）を
 * その場で見直せるように出す。未分類が残っていれば注意も出す。
 */
export const ConfirmSummary = ({ transactions, year }: ConfirmSummaryProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeCorrectedFigures(yearTransactions, year),
    [yearTransactions, year],
  );
  const income = useMemo(
    () => sumByCategory(yearTransactions.filter((t) => t.amount > 0), false),
    [yearTransactions],
  );
  const expenses = useMemo(
    () => sumByCategory(yearTransactions.filter((t) => t.amount < 0), true),
    [yearTransactions],
  );
  const unclassifiedCount = yearTransactions.filter((t) => t.category === "未分類").length;
  const totalIncome = figures._detail.business_income + figures._detail.real_estate_income;

  if (yearTransactions.length === 0) {
    return <Text variant="muted">この年の取引はまだありません。先に帳簿へ取り込んでください。</Text>;
  }

  const totals: readonly { label: string; amount: number }[] = [
    { label: "事業収入", amount: figures.business_revenue },
    { label: "事業経費", amount: figures.business_expenses },
    { label: "不動産収入", amount: figures.real_estate_revenue },
    { label: "不動産経費", amount: figures.real_estate_expenses },
    { label: "青色申告特別控除", amount: figures.blue_deduction },
  ];

  return (
    <Col gap="md">
      <Col gap="sm">
        <Text variant="statLabel">合計</Text>
        {totals.map((row) => (
          <Row key={row.label} align="center" justify="spaceBetween">
            <Text variant="muted">{row.label}</Text>
            <Text className={styles.amount}>{formatYen(row.amount)}</Text>
          </Row>
        ))}
        <Row align="center" justify="spaceBetween" className={styles.totalRow}>
          <Text>所得合計（青色控除後）</Text>
          <Text className={styles.amount}>{formatYen(totalIncome)}</Text>
        </Row>
      </Col>

      <div className={styles.breakdownGrid}>
        <CategoryList title="収入の内訳" rows={income} />
        <CategoryList title="支出の内訳" rows={expenses} />
      </div>

      {unclassifiedCount > 0 ? (
        <AlertBox variant="notice">
          未分類の取引が {unclassifiedCount} 件あります。帳簿で勘定科目を付けてから確認済みにしてください。
        </AlertBox>
      ) : null}
    </Col>
  );
};

const CategoryList = ({ title, rows }: { title: string; rows: readonly CategoryAmount[] }) => {
  return (
    <Col gap="sm">
      <Text variant="statLabel">{title}</Text>
      {rows.length === 0 ? (
        <Text variant="muted">なし</Text>
      ) : (
        rows.map((row) => (
          <Row key={row.category} align="center" justify="spaceBetween">
            <Text variant="muted">{row.category}</Text>
            <Text className={styles.amount}>{formatYen(row.amount)}</Text>
          </Row>
        ))
      )}
    </Col>
  );
};

/** 科目ごとに合計し、金額の大きい順に並べる（支出は絶対値で）。 */
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
