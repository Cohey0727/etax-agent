import { balanceSheetToWire, IncomeType, isBalanceSheetEmpty } from "@etax/shared";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { TrialBalanceResponse, fetchTrialBalance } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { AppText, Card, ScreenContainer, SkeletonCard } from "@/components";
import { FreeeTrialBalanceCard } from "@/features/dashboard/FreeeTrialBalanceCard";
import { hydrateDeductionStateFromServer } from "@/features/filing/deductionState";
import { BalanceSheetSection, MonthlySection, OtherSection, PlSection } from "@/features/reports";
import { useAppState } from "@/state/AppContext";

export default function ReportsScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const router = useRouter();
  const { year, transactions } = useAppState();

  // 科目タップで、その科目（表示名に集約される前の勘定科目すべて）に
  // 絞った帳簿へ遷移する。
  const handleDrillDown = (incomeType: IncomeType, categories: string[]) => {
    router.push({
      pathname: "/ledger",
      params: { year: String(year), cat: categories, itype: incomeType },
    });
  };
  const [report, setReport] = useState<TrialBalanceResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setFailed(false);
    void (async () => {
      const filing = await hydrateDeductionStateFromServer(userId, year).catch(() => null);
      if (cancelled) return;
      try {
        const result = await fetchTrialBalance({
          transactions,
          year,
          filing_type: filing?.filingType,
          real_estate_business_scale: filing?.realEstateBusinessScale,
          balance_sheet:
            filing?.balanceSheet && !isBalanceSheetEmpty(filing.balanceSheet)
              ? balanceSheetToWire(filing.balanceSheet)
              : undefined,
        });
        if (!cancelled) setReport(result);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, transactions, year]);

  const hasTransactions = useMemo(
    () => transactions.some((t) => t.year === year),
    [transactions, year],
  );

  if (failed) {
    return (
      <ScreenContainer>
        <Card>
          <AppText size="sm" tone="muted">
            試算表を取得できませんでした。時間をおいて再度開いてください。
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
  if (!hasTransactions) {
    return (
      <ScreenContainer>
        <Card>
          <AppText size="sm" weight="semibold" tone="subtle">
            残高試算表
          </AppText>
          <AppText size="sm" tone="muted">
            {year}年の取引はまだありません。帳簿に取引が入ると、ここに決算書と一致する試算表が表示されます。
          </AppText>
        </Card>
        <FreeeTrialBalanceCard year={year} />
      </ScreenContainer>
    );
  }
  return (
    <ScreenContainer>
      <PlSection
        title="事業所得（損益計算書）"
        year={year}
        current={report.business}
        previous={report.previous.business}
        incomeType="business"
        onDrillDown={handleDrillDown}
      />
      <PlSection
        title="不動産所得（損益計算書）"
        year={year}
        current={report.real_estate}
        previous={report.previous.real_estate}
        incomeType="real_estate"
        onDrillDown={handleDrillDown}
      />
      <OtherSection current={report.other} previous={report.previous.other} onDrillDown={handleDrillDown} />
      <MonthlySection year={year} current={report.monthly} previous={report.previous.monthly} />
      {report.balance_sheet ? <BalanceSheetSection balanceSheet={report.balance_sheet} /> : null}
      <FreeeTrialBalanceCard year={year} />
    </ScreenContainer>
  );
}
