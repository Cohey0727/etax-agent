import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, Input, Row, SkeletonBar, Text } from "@components/atoms";
import { CashFlowReport } from "@types";
import { fetchCashFlowReport, formatYen } from "@utils";
import { BalanceChart } from "./BalanceChart";
import styles from "./CashFlowPanel.css";
import { MonthlyTable } from "./MonthlyTable";
import { UpcomingSection } from "./UpcomingSection";

/**
 * 資金繰りレポート（Issue #19）。帳簿の取引実績と、未入金の請求書が
 * 支払期日どおりに入金される前提の試算で、月次の将来残高を表示する。
 * 集計はサーバー側の決定的な計算（GET /api/cash-flow）に寄せ、REST /
 * MCP と同じ結果を表示する。期首残高は表示窓の開始月初時点の残高で、
 * 入力すると残高の試算に反映される（保存はしない表示用の値）。
 */
export const CashFlowPanel = () => {
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState("0");
  const [appliedOpeningBalance, setAppliedOpeningBalance] = useState(0);

  const load = useCallback(async (openingBalance: number) => {
    setFailed(false);
    try {
      const result = await fetchCashFlowReport({ opening_balance: openingBalance });
      setReport(result);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load(appliedOpeningBalance);
  }, [load, appliedOpeningBalance]);

  const handleApplyOpeningBalance = () => {
    const value = Number(openingBalanceDraft);
    if (Number.isInteger(value)) {
      setReport(null);
      setAppliedOpeningBalance(value);
    }
  };

  if (failed) {
    return (
      <Card>
        <Text variant="muted">
          資金繰りレポートを取得できませんでした。時間をおいて再度開いてください。
        </Text>
      </Card>
    );
  }
  if (!report) return <CashFlowSkeleton />;
  const hasData =
    report.months.some((m) => m.actual_inflow !== 0 || m.actual_outflow !== 0) ||
    report.upcoming_receipts.length > 0 ||
    report.undated_receipts.length > 0;
  return (
    <Col gap="md">
      <Card>
        <Col gap="sm">
          <Text variant="statLabel">資金繰りレポート</Text>
          <Text variant="muted">
            登録済みの取引実績と未入金の請求書に基づく試算です。
            {report.from_month} から {report.to_month} までを表示しています。
            最終月の月末残高（試算）は {formatYen(report.projected_closing_balance)} です。
          </Text>
          <Row gap="sm">
            <Text variant="caption">期首残高（円）</Text>
            <Input
              className={styles.openingBalanceInput}
              type="number"
              value={openingBalanceDraft}
              onChange={(event) => setOpeningBalanceDraft(event.target.value)}
            />
            <Button variant="tab" onClick={handleApplyOpeningBalance}>
              反映
            </Button>
          </Row>
        </Col>
      </Card>
      {hasData ? (
        <>
          <MonthlyTable months={report.months} openingBalance={report.opening_balance} />
          <BalanceChart months={report.months} />
          <UpcomingSection
            upcoming={report.upcoming_receipts}
            undated={report.undated_receipts}
            overdueAmount={report.overdue_amount}
          />
        </>
      ) : (
        <Card>
          <Text variant="muted">
            取引も未入金の請求書もまだありません。帳簿に取引が入り、請求書を発行すると、
            ここに資金繰りの試算が表示されます。
          </Text>
        </Card>
      )}
    </Col>
  );
};

/** 読み込み中のスケルトン（月次表の形に似せた形）。 */
const CashFlowSkeleton = () => (
  <Col gap="md">
    {[0, 1].map((card) => (
      <Card key={card}>
        <Col gap="sm">
          <SkeletonBar width="30%" height={14} />
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <SkeletonBar key={row} width="100%" height={12} />
          ))}
        </Col>
      </Card>
    ))}
  </Col>
);
