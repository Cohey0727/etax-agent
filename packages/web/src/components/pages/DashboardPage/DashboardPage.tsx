import { Col } from "@components/atoms";
import {
  BreakdownPanel,
  DashboardPanel,
  FilingStatusPanel,
  FreeeTrialBalance,
} from "@components/organisms/dashboard";
import { ViewPageProps } from "@types";

export const DashboardPage = ({ transactions, year, onNavigate }: ViewPageProps) => {
  return (
    <Col gap="md">
      <FilingStatusPanel transactions={transactions} year={year} onNavigate={onNavigate} />
      <DashboardPanel transactions={transactions} year={year} />
      <BreakdownPanel transactions={transactions} year={year} />
      <FreeeTrialBalance year={year} />
    </Col>
  );
};
