import { ConsumptionTaxSummary } from "@etax/shared";
import { Button, Col, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { formatYen } from "@utils";
import styles from "./ConsumptionLedgerSummary.css";

export interface ConsumptionLedgerSummaryProps {
  /** 帳簿の税区分ごとの集計 */
  summary: ConsumptionTaxSummary;
  /**
   * 帳簿画面をこの年度＋警告種別のフィルターで開く。
   * kind: "mismatch" = 税区分と符号の不一致、"taxUnset" = 税区分が未設定。
   */
  onOpenLedger?: (kind: "mismatch" | "taxUnset") => void;
}

const SUMMARY_ROWS: readonly { key: keyof ConsumptionTaxSummary; label: string }[] = [
  { key: "salesIncl10", label: "課税売上（税込）・10%" },
  { key: "salesIncl8", label: "課税売上（税込）・軽減8%" },
  { key: "nontaxableSales", label: "非課税売上（対価の額）" },
  { key: "exemptSales", label: "免税売上（対価の額）" },
  { key: "purchasesIncl10", label: "課税仕入（税込）・10%" },
  { key: "purchasesIncl8", label: "課税仕入（税込）・軽減8%" },
];

/**
 * 消費税申告書の、帳簿の税区分から決まる金額（自動）。税区分が未設定・
 * 符号と不一致で集計から外れた取引があれば、帳簿で直す動線と一緒に知らせる。
 */
export const ConsumptionLedgerSummary = ({ summary, onOpenLedger }: ConsumptionLedgerSummaryProps) => (
  <Col gap="md">
    <Text className={styles.subhead}>帳簿からの集計（自動）</Text>
    {SUMMARY_ROWS.map((row) => (
      <Row key={row.key} gap="sm">
        <Row align="center" className={styles.label}>
          <Text variant="muted">{row.label}</Text>
        </Row>
        <Text className={styles.amount}>{formatYen(summary[row.key])}</Text>
      </Row>
    ))}
    {summary.unsetCount > 0 ? (
      <AlertBox variant="notice">
        <Row gap="sm" align="center" justify="spaceBetween" wrap>
          <Text>
            税区分が未設定の取引が {summary.unsetCount} 件（合計 {formatYen(summary.unsetAmount)}
            ）あります。集計に含まれていません。
          </Text>
          {onOpenLedger ? (
            <Button variant="ghost" size="sm" onClick={() => onOpenLedger("taxUnset")}>
              帳簿で確認する →
            </Button>
          ) : null}
        </Row>
      </AlertBox>
    ) : null}
    {summary.excludedCount > 0 ? (
      <AlertBox variant="notice">
        <Row gap="sm" align="center" justify="spaceBetween" wrap>
          <Text>
            税区分と金額の符号が不一致の取引が {summary.excludedCount} 件（合計{" "}
            {formatYen(summary.excludedAmount)}）あります。集計に含まれていません。
          </Text>
          {onOpenLedger ? (
            <Button variant="ghost" size="sm" onClick={() => onOpenLedger("mismatch")}>
              帳簿で確認する →
            </Button>
          ) : null}
        </Row>
      </AlertBox>
    ) : null}
  </Col>
);
