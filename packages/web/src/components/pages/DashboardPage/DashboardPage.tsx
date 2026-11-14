import { DashboardPanel } from "@components/organisms/dashboard";
import { ViewPageProps } from "@types";

export const DashboardPage = ({ transactions }: ViewPageProps) => {
  return <DashboardPanel transactions={transactions} />;
};
