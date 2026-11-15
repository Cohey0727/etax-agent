import { Col } from "@components/atoms";
import {
  BreakdownPanel,
  DashboardPanel,
  FilingStatusPanel,
  FreeeTrialBalance,
  YearlyTrendPanel,
} from "@components/organisms/dashboard";
import { ViewPageProps } from "@types";

/**
 * ダッシュボードの並び。先頭は年度を跨ぐ情報（売り上げ・経費・収支の推移）、
 * 続いて今年の情報（申請状況、収支の詳細）。
 */
export const DashboardPage = ({ transactions, year, onNavigate }: ViewPageProps) => {
  return (
    <Col gap="md">
      <YearlyTrendPanel transactions={transactions} />
      <FilingStatusPanel transactions={transactions} year={year} onNavigate={onNavigate} />
      <DashboardPanel transactions={transactions} year={year} />
      <BreakdownPanel transactions={transactions} year={year} />
      <FreeeTrialBalance year={year} />
    </Col>
  );
};
