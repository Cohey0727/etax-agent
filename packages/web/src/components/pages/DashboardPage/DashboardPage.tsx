import { DashboardPanel } from "@components/organisms/dashboard";
import { ViewPageProps } from "@types";

export const DashboardPage = ({ transactions, year }: ViewPageProps) => {
  return <DashboardPanel transactions={transactions} year={year} />;
};
