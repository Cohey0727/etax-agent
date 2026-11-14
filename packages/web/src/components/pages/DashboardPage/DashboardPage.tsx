import { Col } from "@components/atoms";
import { DashboardPanel, FreeeTrialBalance } from "@components/organisms/dashboard";
import { ViewPageProps } from "@types";

export const DashboardPage = ({ transactions, year }: ViewPageProps) => {
  return (
    <Col gap="md">
      <DashboardPanel transactions={transactions} year={year} />
      <FreeeTrialBalance year={year} />
    </Col>
  );
};
