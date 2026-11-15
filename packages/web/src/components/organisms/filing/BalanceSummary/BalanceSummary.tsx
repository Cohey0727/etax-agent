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
import { BalanceRecords } from "../BalanceRecords";
import { formatYen } from "@utils";
import styles from "./BalanceSummary.css";

interface CategoryAmount {
  category: string;
  amount: number;
}

interface MonthlyAmount {
  month: number;
  income: number;
  expense: number;
  balance: number;
  cumulative: number;
}

export interface BalanceSummaryProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 青色申告特別控除の計算条件（申告の種類・不動産の規模） */
  filingOptions?: BlueDeductionOptions;
  /** 雑所得（その他）。帳簿に載らない所得として合計に含める。 */
  miscIncome?: MiscIncomeInput;
}

/**
 * 確定申告の「収支」タブの中身。その年の帳簿を収支として見直せるように、
 * 収入・支出・差引（収支）を中心に置き、事業／不動産ごとの収支、
 * そこから所得合計への内訳、月別の収支と累計、勘定科目ごとの内訳を出し、
 * 末尾に集計の対象になっている帳簿レコードそのものも並べる。
 * 未分類が残っていれば注意も出す。
 */
export const BalanceSummary = ({ transactions, year, filingOptions, miscIncome }: BalanceSummaryProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, filingOptions),
    [yearTransactions, year, filingOptions?.filingType, filingOptions?.realEstateBusinessScale],
  );
  const incomeTotal = useMemo(
    () => yearTransactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + Math.trunc(t.amount), 0),
    [yearTransactions],
  );
  const expenseTotal = useMemo(
    () => yearTransactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(Math.trunc(t.amount)), 0),
    [yearTransactions],
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
  const businessBalance = figures.business_revenue - figures.business_expenses;
  const realEstateBalance = figures.real_estate_revenue - figures.real_estate_expenses;

  if (yearTransactions.length === 0) {
    return <Text variant="muted">この年の取引はまだありません。先に帳簿へ取り込んでください。</Text>;
  }

  const isWhite = filingOptions?.filingType === "white";
  const suffix = isWhite ? "" : "（青色控除後）";
  const statCards: readonly { label: string; value: string }[] = [
    { label: "収入合計", value: formatYen(incomeTotal) },
    { label: "支出合計", value: formatYen(expenseTotal) },
    { label: "収支（差引）", value: formatYen(incomeTotal - expenseTotal) },
    { label: `所得合計${suffix}`, value: formatYen(totalIncome) },
  ];

  const bridgeRows: readonly { label: string; amount: number }[] = [
    { label: "事業の差引", amount: businessBalance },
    { label: "不動産の差引", amount: realEstateBalance },
    {
      label: isWhite ? "青色申告特別控除（白色申告のためなし）" : "青色申告特別控除",
      amount: -figures.blue_deduction,
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

      <div className={styles.breakdownGrid}>
        <DivisionBalance title="事業の収支" revenue={figures.business_revenue} expenses={figures.business_expenses} />
        <DivisionBalance
          title="不動産の収支"
          revenue={figures.real_estate_revenue}
          expenses={figures.real_estate_expenses}
        />
      </div>

      <Col gap="sm">
        <Text variant="statLabel">所得の内訳</Text>
        {bridgeRows.map((row) => (
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
        <Text variant="statLabel">月別の収支</Text>
        <MonthlyTable rows={monthly} incomeTotal={incomeTotal} expenseTotal={expenseTotal} />
      </Col>

      <div className={styles.breakdownGrid}>
        <CategoryList title="収入の内訳" rows={income} tone="income" />
        <CategoryList title="支出の内訳" rows={expenses} tone="expense" />
      </div>

      <BalanceRecords key={year} transactions={yearTransactions} />

      {unclassifiedCount > 0 ? (
        <AlertBox variant="notice">
          未分類の取引が {unclassifiedCount} 件あります。帳簿で勘定科目を付けてから確認済みにしてください。
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

const MonthlyTable = ({
  rows,
  incomeTotal,
  expenseTotal,
}: {
  rows: readonly MonthlyAmount[];
  incomeTotal: number;
  expenseTotal: number;
}) => (
  <div>
    <div className={`${styles.monthRow} ${styles.monthHead}`}>
      <span>月</span>
      <span className={styles.monthCell}>収入</span>
      <span className={styles.monthCell}>支出</span>
      <span className={styles.monthCell}>差引</span>
      <span className={styles.monthCell}>累計収支</span>
    </div>
    {rows.map((row) => (
      <div key={row.month} className={styles.monthRow}>
        <span>{row.month}月</span>
        <span className={styles.monthCell}>{formatYen(row.income)}</span>
        <span className={styles.monthCell}>{formatYen(row.expense)}</span>
        <span className={`${styles.monthCell} ${row.balance < 0 ? styles.amountNegative : ""}`}>
          {formatYen(row.balance)}
        </span>
        <span className={`${styles.monthCell} ${row.cumulative < 0 ? styles.amountNegative : ""}`}>
          {formatYen(row.cumulative)}
        </span>
      </div>
    ))}
    <div className={`${styles.monthRow} ${styles.monthTotal}`}>
      <span>合計</span>
      <span className={styles.monthCell}>{formatYen(incomeTotal)}</span>
      <span className={styles.monthCell}>{formatYen(expenseTotal)}</span>
      <span className={styles.monthCell}>{formatYen(incomeTotal - expenseTotal)}</span>
      <span className={styles.monthCell}>―</span>
    </div>
  </div>
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

/** 月ごとの収入・支出・差引と、差引の累計（累計収支）。取引のない月も0で並べる。 */
function sumByMonth(transactions: Transaction[]): MonthlyAmount[] {
  const rows: MonthlyAmount[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
    balance: 0,
    cumulative: 0,
  }));
  for (const t of transactions) {
    const month = Number(t.date.slice(5, 7));
    if (month < 1 || month > 12) continue;
    if (t.amount > 0) rows[month - 1].income += Math.trunc(t.amount);
    else rows[month - 1].expense += Math.abs(Math.trunc(t.amount));
  }
  let cumulative = 0;
  for (const row of rows) {
    row.balance = row.income - row.expense;
    cumulative += row.balance;
    row.cumulative = cumulative;
  }
  return rows;
}
