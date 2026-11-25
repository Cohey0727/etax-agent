import {
  BlueDeductionOptions,
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  MiscIncomeInput,
  SalaryIncomeInput,
  computeCorrectedFigures,
  computeManualIncomes,
  filterYear,
  transactionBusinessAmount,
  Transaction,
} from "@etax/shared";
import { useMemo } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { formatYen } from "@utils";
import styles from "./BalanceSummary.css";

interface CategoryAmount {
  category: string;
  amount: number;
}

export interface BalanceSummaryProps {
  transactions: Transaction[];
  /** 左上の年度切替で選ばれている年 */
  year: number;
  /** 青色申告特別控除の計算条件（申告の種類・不動産の規模） */
  filingOptions?: BlueDeductionOptions;
  /** 雑所得。帳簿に載らない所得として合計に含める。 */
  miscIncome?: MiscIncomeInput;
  /** 給与所得。帳簿に載らない所得として合計に含める。 */
  salaryIncome?: SalaryIncomeInput;
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
export const BalanceSummary = ({ transactions, year, filingOptions, miscIncome, salaryIncome, onOpenUnclassified }: BalanceSummaryProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const figures = useMemo(
    () => computeCorrectedFigures(yearTransactions, year, filingOptions),
    [yearTransactions, year, filingOptions?.filingType, filingOptions?.realEstateBusinessScale],
  );
  // 収入・支出の見出しは事業＋不動産だけを数える。口座の生の出入り
  // （チャージ・振替・投資・カード決済などの「その他」区分）を収入に
  // 混ぜると、実態とかけ離れた金額になるため。
  const incomeTotal = figures.business_revenue + figures.real_estate_revenue;
  const expenseTotal = figures.business_expenses + figures.real_estate_expenses;
  const scopedTransactions = useMemo(
    () => yearTransactions.filter((t) => t.income_type !== "other"),
    [yearTransactions],
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
    const others = yearTransactions.filter((t) => t.income_type === "other");
    return {
      count: others.length,
      income: others.filter((t) => t.amount > 0).reduce((sum, t) => sum + Math.trunc(t.amount), 0),
      expense: others
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(Math.trunc(t.amount)), 0),
    };
  }, [yearTransactions]);
  const unclassifiedCount = yearTransactions.filter((t) => t.category === "未分類").length;
  const manual = computeManualIncomes(
    year,
    salaryIncome ?? EMPTY_SALARY_INCOME,
    miscIncome ?? EMPTY_MISC_INCOME,
    figures._detail.business_income + figures._detail.real_estate_income,
  );
  const totalIncome = figures._detail.business_income + figures._detail.real_estate_income + manual.total;
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
    ...(manual.salary > 0 ? [{ label: "給与所得", amount: manual.salary }] : []),
    ...(manual.pension > 0 ? [{ label: "雑所得（公的年金等）", amount: manual.pension }] : []),
    ...(manual.miscBusiness > 0 ? [{ label: "雑所得（業務）", amount: manual.miscBusiness }] : []),
    ...(manual.miscOther > 0 ? [{ label: "雑所得（その他）", amount: manual.miscOther }] : []),
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
