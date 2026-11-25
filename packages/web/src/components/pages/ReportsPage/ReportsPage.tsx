import { TrialBalancePanel } from "@components/organisms/reports";
import { ViewPageProps } from "@types";

/** 残高試算表レポート。対象年度は左上の年度切替（AppPage が保持）に従う。 */
export const ReportsPage = ({ transactions, year, onNavigate }: ViewPageProps) => {
  return <TrialBalancePanel transactions={transactions} year={year} onNavigate={onNavigate} />;
};
