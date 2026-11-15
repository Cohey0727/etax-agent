import { Transaction } from "@etax/shared";
import { useMemo } from "react";
import { Card, Col, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./MonthlyBalance.css";

interface MonthlyAmount {
  month: number;
  income: number;
  expense: number;
  balance: number;
  cumulative: number;
}

export interface MonthlyBalanceProps {
  /** その年で絞り込み済みの取引（割り当て年度ベース）。 */
  transactions: Transaction[];
}

/**
 * 収支タブの「月別の収支」を独立した1枚のカードで出す。
 * 月ごとの収入・支出・差引と、差引の累計（累計収支）。
 * 取引のない月も0で並べる。
 */
export const MonthlyBalance = ({ transactions }: MonthlyBalanceProps) => {
  const monthly = useMemo(() => sumByMonth(transactions), [transactions]);
  const incomeTotal = useMemo(
    () => transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + Math.trunc(t.amount), 0),
    [transactions],
  );
  const expenseTotal = useMemo(
    () => transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(Math.trunc(t.amount)), 0),
    [transactions],
  );

  if (transactions.length === 0) return null;

  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">月別の収支</Text>
        <div>
          <div className={`${styles.monthRow} ${styles.monthHead}`}>
            <span>月</span>
            <span className={styles.monthCell}>収入</span>
            <span className={styles.monthCell}>支出</span>
            <span className={styles.monthCell}>差引</span>
            <span className={styles.monthCell}>累計収支</span>
          </div>
          {monthly.map((row) => (
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
      </Col>
    </Card>
  );
};

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
