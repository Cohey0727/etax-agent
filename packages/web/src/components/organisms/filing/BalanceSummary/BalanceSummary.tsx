import { FilingFigures, FilingType, Transaction, transactionBusinessAmount } from "@etax/shared";
import { useMemo } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import {
  incomeBridgeRows,
  incomeStatCards,
  totalIncomeLabel,
} from "@components/organisms/filing/IncomeSummary";
import { formatYen } from "@utils";
import styles from "./BalanceSummary.css";

interface CategoryAmount {
  category: string;
  amount: number;
}

export interface BalanceSummaryProps {
  /** 対象年の帳簿の取引（割り当て年度で絞り込み済み） */
  transactions: Transaction[];
  /** 帳簿と申告入力から求めた所得と税額（確定申告画面が計算したもの） */
  figures: FilingFigures;
  /** 申告の種類（白色は青色申告特別控除の行の表記を変える） */
  filingType: FilingType;
  /** 未分類の警告から、帳簿を年度＋未分類フィルターで開く。 */
  onOpenUnclassified?: () => void;
}

/**
 * 確定申告の「収支」タブの集計カードの中身。その年の帳簿を収支として
 * 見直せるように、収入・支出・差引（収支）を中心に置き、事業／不動産
 * ごとの収支、そこから所得合計への内訳、勘定科目ごとの内訳を出す。
 * 月別の収支と、集計の対象になっている帳簿の取引そのものは、隣の
 * MonthlyBalance と BalanceRecords がそれぞれ別カードで並べる。
 * 未分類が残っていれば注意も出す。
 */
export const BalanceSummary = ({ transactions, figures, filingType, onOpenUnclassified }: BalanceSummaryProps) => {
  const scopedTransactions = useMemo(
    () => transactions.filter((t) => t.income_type !== "other"),
    [transactions],
  );
  // 内訳も見出し（申告数値）と同じ事業分で集計し、合計が一致するようにする。
  const income = useMemo(
    () => sumByCategory(scopedTransactions.filter((t) => transactionBusinessAmount(t) > 0), false),
    [scopedTransactions],
  );
  const expenses = useMemo(
    () => sumByCategory(scopedTransactions.filter((t) => transactionBusinessAmount(t) < 0), true),
    [scopedTransactions],
  );
  const otherFlow = useMemo(() => {
    const others = transactions.filter((t) => t.income_type === "other");
    return {
      count: others.length,
      income: others.filter((t) => t.amount > 0).reduce((sum, t) => sum + Math.trunc(t.amount), 0),
      expense: others
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(Math.trunc(t.amount)), 0),
    };
  }, [transactions]);
  const unclassifiedCount = transactions.filter((t) => t.category === "未分類").length;
  const isWhite = filingType === "white";
  const c = figures.corrected;

  return (
    <Col gap="md">
      {transactions.length === 0 ? (
        <Text variant="muted">この年の取引はまだありません。先に帳簿へ取り込んでください。</Text>
      ) : null}
      <div className={styles.statGrid}>
        {incomeStatCards(figures, isWhite).map((card) => (
          <Card key={card.label}>
            <Col gap="none">
              <Text variant="statLabel">{card.label}</Text>
              <Text variant="statValue">{formatYen(card.amount)}</Text>
            </Col>
          </Card>
        ))}
      </div>

      <div className={styles.breakdownGrid}>
        <DivisionBalance title="事業の収支" revenue={c.business_revenue} expenses={c.business_expenses} />
        <DivisionBalance
          title="不動産の収支"
          revenue={c.real_estate_revenue}
          expenses={c.real_estate_expenses}
        />
      </div>

      <Col gap="sm">
        <Text variant="statLabel">所得の内訳</Text>
        {incomeBridgeRows(figures, isWhite).map((row) => (
          <Row key={row.label} align="center" justify="spaceBetween">
            <Text variant="muted">{row.label}</Text>
            <Text className={styles.amount}>{formatYen(row.amount)}</Text>
          </Row>
        ))}
        <Row align="center" justify="spaceBetween" className={styles.totalRow}>
          <Text>{totalIncomeLabel(isWhite)}</Text>
          <Text className={styles.amount}>{formatYen(figures.totalIncome)}</Text>
        </Row>
      </Col>

      <div className={styles.breakdownGrid}>
        <CategoryList title="収入の内訳" rows={income} tone="income" />
        <CategoryList title="支出の内訳" rows={expenses} tone="expense" />
      </div>

      {otherFlow.count > 0 ? (
        <Text variant="caption">
          集計対象外（資金移動・投資・個人的な出入り）: {otherFlow.count} 件・入金{" "}
          {formatYen(otherFlow.income)} / 出金 {formatYen(otherFlow.expense)}
        </Text>
      ) : null}

      {unclassifiedCount > 0 ? (
        <AlertBox variant="notice">
          <Row gap="sm" align="center" justify="spaceBetween" wrap>
            <Text>
              未分類の取引が {unclassifiedCount} 件あります。帳簿で勘定科目を付けてから確認済みにしてください。
            </Text>
            {onOpenUnclassified ? (
              <Button variant="ghost" size="sm" onClick={onOpenUnclassified}>
                帳簿で確認する →
              </Button>
            ) : null}
          </Row>
        </AlertBox>
      ) : null}
    </Col>
  );
};

const DivisionBalance = ({
  title,
  revenue,
  expenses,
}: {
  title: string;
  revenue: number;
  expenses: number;
}) => (
  <Col gap="sm">
    <Text variant="statLabel">{title}</Text>
    <Row align="center" justify="spaceBetween">
      <Text variant="muted">収入</Text>
      <Text className={styles.amount}>{formatYen(revenue)}</Text>
    </Row>
    <Row align="center" justify="spaceBetween">
      <Text variant="muted">経費</Text>
      <Text className={styles.amount}>{formatYen(expenses)}</Text>
    </Row>
    <Row align="center" justify="spaceBetween" className={styles.subtotalRow}>
      <Text>差引</Text>
      <Text className={styles.amount}>{formatYen(revenue - expenses)}</Text>
    </Row>
  </Col>
);

const BAR_FILL_CLASS: Record<"income" | "expense", string> = {
  income: styles.barFillIncome,
  expense: styles.barFillExpense,
};

const CategoryList = ({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: readonly CategoryAmount[];
  tone: "income" | "expense";
}) => {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return (
    <Col gap="sm">
      <Text variant="statLabel">{title}</Text>
      {rows.length === 0 ? (
        <Text variant="muted">なし</Text>
      ) : (
        rows.map((row) => (
          <Col key={row.category} gap="none">
            <Row align="center" justify="spaceBetween">
              <Text variant="muted">{row.category}</Text>
              <Text className={styles.amount}>
                {formatYen(row.amount)}
                <Text variant="muted">
                  （{total > 0 ? Math.round((row.amount / total) * 100) : 0}%）
                </Text>
              </Text>
            </Row>
            <div className={styles.barTrack}>
              <div
                className={BAR_FILL_CLASS[tone]}
                style={{ width: `${Math.round((row.amount / max) * 100)}%` }}
              />
            </div>
          </Col>
        ))
      )}
    </Col>
  );
};

/** 科目ごとに事業分を合計し、金額の大きい順に並べる（支出は絶対値で）。 */
function sumByCategory(transactions: Transaction[], absolute: boolean): CategoryAmount[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    const businessAmount = transactionBusinessAmount(t);
    const amount = absolute ? Math.abs(businessAmount) : businessAmount;
    totals.set(t.category, (totals.get(t.category) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}
