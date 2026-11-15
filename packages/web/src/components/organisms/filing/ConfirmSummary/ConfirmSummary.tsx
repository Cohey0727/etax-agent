import {
  BlueDeductionOptions,
  MiscIncomeInput,
  computeCorrectedFigures,
  filterYear,
  Transaction,
} from "@etax/shared";
import { useMemo } from "react";
import { Card, Col, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { formatYen } from "@utils";
import styles from "./ConfirmSummary.css";

interface CategoryAmount {
  category: string;
  amount: number;
}

interface MonthlyAmount {
  month: number;
  income: number;
  expense: number;
}

export interface ConfirmSummaryProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 青色申告特別控除の計算条件（申告の種類・不動産の規模） */
  filingOptions?: BlueDeductionOptions;
  /** 雑所得（その他）。帳簿に載らない所得として合計に含める。 */
  miscIncome?: MiscIncomeInput;
}

/**
 * 確定申告の「帳簿」欄の中身。所得の統計カード、事業／不動産の
 * 収入・経費と青色申告特別控除の内訳、月別の推移、勘定科目ごとの内訳を
 * その場で見直せるように出す。未分類が残っていれば注意も出す。
 */
export const ConfirmSummary = ({ transactions, year, filingOptions, miscIncome }: ConfirmSummaryProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, filingOptions),
    [yearTransactions, year, filingOptions?.filingType, filingOptions?.realEstateBusinessScale],
  );
  const income = useMemo(
    () => sumByCategory(yearTransactions.filter((t) => t.amount > 0), false),
    [yearTransactions],
  );
  const expenses = useMemo(
    () => sumByCategory(yearTransactions.filter((t) => t.amount < 0), true),
    [yearTransactions],
  );
  const monthly = useMemo(() => sumByMonth(yearTransactions), [yearTransactions]);
  const unclassifiedCount = yearTransactions.filter((t) => t.category === "未分類").length;
  const misc = miscIncome?.income ?? 0;
  const totalIncome = figures._detail.business_income + figures._detail.real_estate_income + misc;

  if (yearTransactions.length === 0) {
    return <Text variant="muted">この年の取引はまだありません。先に帳簿へ取り込んでください。</Text>;
  }

  const isWhite = filingOptions?.filingType === "white";
  const suffix = isWhite ? "" : "（青色控除後）";
  const statCards: readonly { label: string; value: string }[] = [
    { label: `事業所得${suffix}`, value: formatYen(figures._detail.business_income) },
    { label: `不動産所得${suffix}`, value: formatYen(figures._detail.real_estate_income) },
    ...(misc > 0 ? [{ label: "雑所得", value: formatYen(misc) }] : []),
    { label: `所得合計${suffix}`, value: formatYen(totalIncome) },
  ];

  const totals: readonly { label: string; amount: number }[] = [
    { label: "事業収入", amount: figures.business_revenue },
    { label: "事業経費", amount: figures.business_expenses },
    { label: "不動産収入", amount: figures.real_estate_revenue },
    { label: "不動産経費", amount: figures.real_estate_expenses },
    {
      label: isWhite ? "青色申告特別控除（白色申告のためなし）" : "青色申告特別控除",
      amount: figures.blue_deduction,
    },
    ...(misc > 0 ? [{ label: "雑所得", amount: misc }] : []),
  ];

  return (
    <Col gap="md">
      <div className={styles.statGrid}>
        {statCards.map((card) => (
          <Card key={card.label}>
            <Col gap="none">
              <Text variant="statLabel">{card.label}</Text>
              <Text variant="statValue">{card.value}</Text>
            </Col>
          </Card>
        ))}
      </div>

      <Col gap="sm">
        <Text variant="statLabel">内訳</Text>
        {totals.map((row) => (
          <Row key={row.label} align="center" justify="spaceBetween">
            <Text variant="muted">{row.label}</Text>
            <Text className={styles.amount}>{formatYen(row.amount)}</Text>
          </Row>
        ))}
        <Row align="center" justify="spaceBetween" className={styles.totalRow}>
          <Text>所得合計{suffix}</Text>
          <Text className={styles.amount}>{formatYen(totalIncome)}</Text>
        </Row>
      </Col>

      <Col gap="sm">
        <Row align="center" justify="spaceBetween">
          <Text variant="statLabel">月別の推移</Text>
          <Row gap="sm" align="center">
            <span className={styles.legendSwatchIncome} />
            <Text variant="muted">収入</Text>
            <span className={styles.legendSwatchExpense} />
            <Text variant="muted">支出</Text>
          </Row>
        </Row>
        <MonthlyChart rows={monthly} />
      </Col>

      <div className={styles.breakdownGrid}>
        <CategoryList title="収入の内訳" rows={income} tone="income" />
        <CategoryList title="支出の内訳" rows={expenses} tone="expense" />
      </div>

      {unclassifiedCount > 0 ? (
        <AlertBox variant="notice">
          未分類の取引が {unclassifiedCount} 件あります。帳簿で勘定科目を付けてから確認済みにしてください。
        </AlertBox>
      ) : null}
    </Col>
  );
};

const MonthlyChart = ({ rows }: { rows: readonly MonthlyAmount[] }) => {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.income, row.expense)));
  return (
    <div className={styles.chart}>
      {rows.map((row) => (
        <div
          key={row.month}
          className={styles.chartCol}
          title={`${row.month}月 収入 ${formatYen(row.income)} / 支出 ${formatYen(row.expense)}`}
        >
          <div className={styles.chartBars}>
            <div
              className={styles.chartBarIncome}
              style={{ height: `${Math.round((row.income / max) * 100)}%` }}
            />
            <div
              className={styles.chartBarExpense}
              style={{ height: `${Math.round((row.expense / max) * 100)}%` }}
            />
          </div>
          <Text variant="muted" className={styles.chartLabel}>
            {row.month}月
          </Text>
        </div>
      ))}
    </div>
  );
};

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

/** 月ごとの収入・支出（支出は絶対値）。取引のない月も0で並べる。 */
function sumByMonth(transactions: Transaction[]): MonthlyAmount[] {
  const rows: MonthlyAmount[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
  }));
  for (const t of transactions) {
    const month = Number(t.date.slice(5, 7));
    if (month < 1 || month > 12) continue;
    if (t.amount > 0) rows[month - 1].income += Math.trunc(t.amount);
    else rows[month - 1].expense += Math.abs(Math.trunc(t.amount));
  }
  return rows;
}
