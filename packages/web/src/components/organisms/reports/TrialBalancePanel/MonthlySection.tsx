import { Card, Col, Text } from "@components/atoms";
import { TrialBalanceMonth } from "@types";
import { formatYen } from "@utils";
import styles from "./TrialBalancePanel.css";

export interface MonthlySectionProps {
  year: number;
  current: TrialBalanceMonth[];
  previous: TrialBalanceMonth[];
}

/**
 * 月次推移表（事業＋不動産）。当年の収入・支出・差引・累計収支に
 * 前年の同月を並べる。集計はサーバー側（日付の月で割り当て）。
 */
export const MonthlySection = ({ year, current, previous }: MonthlySectionProps) => {
  const totals = sumMonths(current);
  const previousTotals = sumMonths(previous);
  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">月次推移（事業＋不動産）</Text>
        <div className={styles.tableScroll}>
          <div className={`${styles.monthRow} ${styles.headRow}`}>
            <span>月</span>
            <span className={styles.cell}>収入</span>
            <span className={styles.cell}>支出</span>
            <span className={styles.cell}>差引</span>
            <span className={styles.cell}>累計収支</span>
            <span className={styles.cell}>前年収入</span>
            <span className={styles.cell}>前年支出</span>
            <span className={styles.cell}>前年差引</span>
          </div>
          {current.map((row) => {
            const prev = previous[row.month - 1];
            return (
              <div key={row.month} className={styles.monthRow}>
                <span>{row.month}月</span>
                <span className={styles.cell}>{formatYen(row.revenue)}</span>
                <span className={styles.cell}>{formatYen(row.expenses)}</span>
                <span className={`${styles.cell} ${row.balance < 0 ? styles.amountNegative : ""}`}>
                  {formatYen(row.balance)}
                </span>
                <span
                  className={`${styles.cell} ${row.cumulative < 0 ? styles.amountNegative : ""}`}
                >
                  {formatYen(row.cumulative)}
                </span>
                <span className={styles.cell}>{formatYen(prev?.revenue ?? 0)}</span>
                <span className={styles.cell}>{formatYen(prev?.expenses ?? 0)}</span>
                <span className={styles.cell}>{formatYen(prev?.balance ?? 0)}</span>
              </div>
            );
          })}
          <div className={`${styles.monthRow} ${styles.totalRow}`}>
            <span>合計</span>
            <span className={styles.cell}>{formatYen(totals.revenue)}</span>
            <span className={styles.cell}>{formatYen(totals.expenses)}</span>
            <span className={styles.cell}>{formatYen(totals.balance)}</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>{formatYen(previousTotals.revenue)}</span>
            <span className={styles.cell}>{formatYen(previousTotals.expenses)}</span>
            <span className={styles.cell}>{formatYen(previousTotals.balance)}</span>
          </div>
        </div>
        <Text variant="caption">{year}年の列が当年、前年の列が{year - 1}年の同月です。</Text>
      </Col>
    </Card>
  );
};

function sumMonths(months: TrialBalanceMonth[]): { revenue: number; expenses: number; balance: number } {
  return {
    revenue: months.reduce((sum, m) => sum + m.revenue, 0),
    expenses: months.reduce((sum, m) => sum + m.expenses, 0),
    balance: months.reduce((sum, m) => sum + m.balance, 0),
  };
}
