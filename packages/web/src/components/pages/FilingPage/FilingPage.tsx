import { FilingFlowPanel } from "@components/organisms/filing";
import { ViewPageProps } from "@types";

export const FilingPage = ({ transactions, year, onNavigate }: ViewPageProps) => {
  return <FilingFlowPanel transactions={transactions} year={year} onNavigate={onNavigate} />;
};
