import { Card, Col, Text } from "@components/atoms";
import { CashFlowMonth } from "@types";
import { formatYen } from "@utils";
import styles from "./CashFlowPanel.css";

export interface MonthlyTableProps {
  months: CashFlowMonth[];
  openingBalance: number;
}

const PHASE_LABELS: Record<CashFlowMonth["phase"], string> = {
  past: "実績",
  current: "当月",
  future: "予定",
};

/**
 * 資金繰りの月次表。過去月は実績のみ、当月以降は実績に入金予定
 * （未消込請求書の残額）を積み上げ、月末残高の推移を示す。
 */
export const MonthlyTable = ({ months, openingBalance }: MonthlyTableProps) => {
  const totals = {
    actualInflow: months.reduce((sum, m) => sum + m.actual_inflow, 0),
    actualOutflow: months.reduce((sum, m) => sum + m.actual_outflow, 0),
    scheduledInflow: months.reduce((sum, m) => sum + m.scheduled_inflow, 0),
  };
  const last = months[months.length - 1];
  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">月次資金繰り表</Text>
        <div className={styles.tableScroll}>
          <div className={`${styles.monthRow} ${styles.headRow}`}>
            <span>月</span>
            <span className={styles.cell}>入金（実績）</span>
            <span className={styles.cell}>出金（実績）</span>
            <span className={styles.cell}>入金予定</span>
            <span className={styles.cell}>増減</span>
            <span className={styles.cell}>月末残高</span>
          </div>
          <div className={styles.monthRow}>
            <span>期首残高</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>{formatYen(openingBalance)}</span>
          </div>
          {months.map((row) => (
            <div key={row.month} className={styles.monthRow}>
              <span>
                {monthLabel(row.month)}
                <span className={styles.phaseLabel}>{PHASE_LABELS[row.phase]}</span>
              </span>
              <span className={styles.cell}>{formatYen(row.actual_inflow)}</span>
              <span className={styles.cell}>{formatYen(row.actual_outflow)}</span>
              <span className={styles.cell}>{formatYen(row.scheduled_inflow)}</span>
              <span className={`${styles.cell} ${row.net_change < 0 ? styles.amountNegative : ""}`}>
                {formatYen(row.net_change)}
              </span>
              <span
                className={`${styles.cell} ${row.closing_balance < 0 ? styles.amountNegative : ""}`}
              >
                {formatYen(row.closing_balance)}
              </span>
            </div>
          ))}
          <div className={`${styles.monthRow} ${styles.totalRow}`}>
            <span>合計</span>
            <span className={styles.cell}>{formatYen(totals.actualInflow)}</span>
            <span className={styles.cell}>{formatYen(totals.actualOutflow)}</span>
            <span className={styles.cell}>{formatYen(totals.scheduledInflow)}</span>
            <span className={styles.cell}>―</span>
            <span className={styles.cell}>{last ? formatYen(last.closing_balance) : "―"}</span>
          </div>
        </div>
        <Text variant="caption">
          入金予定は、未入金の請求書が支払期日どおりに入金される前提の試算です。期日を過ぎた
          未入金分は当月に入金される予定として数えています。
        </Text>
      </Col>
    </Card>
  );
};

/** YYYY-MM を「YYYY年M月」にする。 */
function monthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}
