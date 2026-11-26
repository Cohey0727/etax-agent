import { Href, useRouter } from "expo-router";
import { useCallback } from "react";
import { AppText, ScreenContainer, SelectField, SkeletonCard } from "@/components";
import {
  BreakdownPanel,
  DashboardPanel,
  FilingStatusPanel,
  FreeeTrialBalanceCard,
  MenuGrid,
  SetupChecklistPanel,
  YearlyTrendPanel,
} from "@/features/dashboard";
import { useAppState } from "@/state/AppContext";

export default function HomeScreen() {
  const router = useRouter();
  const { year, years, setYear, transactions, ledgerLoading } = useAppState();

  const navigate = useCallback((href: Href) => router.push(href), [router]);
  const openFiling = useCallback(() => router.push("/filing"), [router]);

  return (
    <ScreenContainer>
      <AppText size="xxl" weight="bold">
        ダッシュボード
      </AppText>
      <SelectField
        label="対象年度"
        value={String(year)}
        options={years.map((y) => ({ value: String(y), label: `${y}年` }))}
        onChange={(value) => setYear(Number(value))}
      />
      {ledgerLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        <>
          <SetupChecklistPanel transactions={transactions} year={year} onNavigate={navigate} />
          <YearlyTrendPanel transactions={transactions} />
          <FilingStatusPanel transactions={transactions} year={year} onOpenFiling={openFiling} />
          <DashboardPanel transactions={transactions} year={year} />
          <BreakdownPanel transactions={transactions} year={year} />
          <FreeeTrialBalanceCard year={year} />
        </>
      )}
      <MenuGrid onNavigate={navigate} />
    </ScreenContainer>
  );
}
