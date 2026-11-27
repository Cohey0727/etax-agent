import { yearMonthLabel } from "@etax/shared";
import { Card, Col, Text } from "@components/atoms";
import { CashFlowReceipt, CashFlowScheduledReceipt } from "@types";
import { formatYen } from "@utils";
import styles from "./CashFlowPanel.css";

export interface UpcomingSectionProps {
  upcoming: CashFlowScheduledReceipt[];
  undated: CashFlowReceipt[];
  overdueAmount: number;
}

/**
 * 入金予定の内訳。期日つきは予定月ごとに積み上げの元になった請求書を
 * 並べ、期日超過にはその旨を示す。期日未設定は月次に積まれていない
 * ため、別枠で明示する（黙って落とさない）。
 */
export const UpcomingSection = ({ upcoming, undated, overdueAmount }: UpcomingSectionProps) => {
  if (upcoming.length === 0 && undated.length === 0) {
    return (
      <Card>
        <Col gap="sm">
          <Text variant="statLabel">入金予定</Text>
          <Text variant="muted">
            未入金の請求書はありません。請求書を発行すると、ここに入金予定が並びます。
          </Text>
        </Col>
      </Card>
    );
  }
  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">入金予定（未入金の請求書）</Text>
        {overdueAmount > 0 ? (
          <Text variant="caption">
            期日を過ぎた未入金が {formatYen(overdueAmount)}{" "}
            あります。当月に入金される予定として試算に含めています。
          </Text>
        ) : null}
        {upcoming.length > 0 ? (
          <div className={styles.tableScroll}>
            <div className={`${styles.receiptRow} ${styles.headRow}`}>
              <span>予定月</span>
              <span>取引先</span>
              <span>帳票番号</span>
              <span>支払期日</span>
              <span>状態</span>
              <span className={styles.cell}>残額</span>
            </div>
            {upcoming.map((receipt) => (
              <div key={receipt.document_id} className={styles.receiptRow}>
                <span>{yearMonthLabel(receipt.scheduled_month)}</span>
                <span>{receipt.counterparty_name}</span>
                <span>{receipt.document_number ?? "―"}</span>
                <span>{receipt.due_date ?? "―"}</span>
                <span>
                  {receipt.overdue ? (
                    <span className={styles.overdueLabel}>期日超過</span>
                  ) : receipt.status === "partial" ? (
                    "一部入金"
                  ) : (
                    "未入金"
                  )}
                </span>
                <span className={styles.cell}>{formatYen(receipt.remaining_amount)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {undated.length > 0 ? (
          <>
            <Text variant="statLabel">期日未設定（月次には未計上）</Text>
            <div className={styles.tableScroll}>
              {undated.map((receipt) => (
                <div key={receipt.document_id} className={styles.receiptRow}>
                  <span>―</span>
                  <span>{receipt.counterparty_name}</span>
                  <span>{receipt.document_number ?? "―"}</span>
                  <span>未設定</span>
                  <span>{receipt.status === "partial" ? "一部入金" : "未入金"}</span>
                  <span className={styles.cell}>{formatYen(receipt.remaining_amount)}</span>
                </div>
              ))}
            </div>
            <Text variant="caption">
              支払期日が未設定の請求書は、入金月が決められないため月次表には含めていません。
            </Text>
          </>
        ) : null}
      </Col>
    </Card>
  );
};
