import { useCallback, useEffect, useState } from "react";
import { CashFlowReport, fetchCashFlowReport } from "@/api";
import { AppButton, AppText, Card, MoneyField, ScreenContainer, SkeletonCard } from "@/components";
import { BalanceChart, MonthlyTable, UpcomingSection } from "@/features/cashflow";
import { monthLabel } from "@/features/cashflow/format";
import { formatYen, parseAmount } from "@/utils";

export default function CashFlowScreen() {
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [openingBalanceDraft, setOpeningBalanceDraft] = useState("0");

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
    void load(0);
  }, [load]);

  const handleApplyOpeningBalance = () => {
    void load(parseAmount(openingBalanceDraft));
  };

  if (failed) {
    return (
      <ScreenContainer>
        <Card>
          <AppText size="sm" tone="muted">
            資金繰りレポートを取得できませんでした。時間をおいて再度開いてください。
          </AppText>
        </Card>
      </ScreenContainer>
    );
  }
  if (!report) {
    return (
      <ScreenContainer>
        <SkeletonCard />
        <SkeletonCard />
      </ScreenContainer>
    );
  }
  const hasData =
    report.months.some((m) => m.actual_inflow !== 0 || m.actual_outflow !== 0) ||
    report.upcoming_receipts.length > 0 ||
    report.undated_receipts.length > 0;
  return (
    <ScreenContainer>
      <Card>
        <AppText size="sm" weight="semibold" tone="subtle">
          資金繰りレポート
        </AppText>
        <AppText size="sm" tone="muted">
          登録済みの取引実績と未入金の請求書に基づく試算です。
          {monthLabel(report.from_month)}から{monthLabel(report.to_month)}
          までを表示しています。 最終月の月末残高（試算）は {formatYen(report.projected_closing_balance)}{" "}
          です。
        </AppText>
        <MoneyField
          label="期首残高（円）"
          value={openingBalanceDraft}
          onChangeValue={setOpeningBalanceDraft}
        />
        <AppButton label="反映" variant="tab" onPress={handleApplyOpeningBalance} />
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
          <AppText size="sm" tone="muted">
            取引も未入金の請求書もまだありません。帳簿に取引が入り、請求書を発行すると、
            ここに資金繰りの試算が表示されます。
          </AppText>
        </Card>
      )}
    </ScreenContainer>
  );
}
