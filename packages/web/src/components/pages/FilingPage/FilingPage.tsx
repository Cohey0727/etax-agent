import { ViewPageProps } from "@types";
import { FilingWorkspace } from "./FilingWorkspace";

export const FilingPage = ({
  transactions,
  year,
  onNavigate,
  filingTab,
  onFilingTabChange,
}: ViewPageProps) => {
  return (
    <FilingWorkspace
      key={year}
      transactions={transactions}
      year={year}
      onNavigate={onNavigate}
      tab={filingTab ?? "overview"}
      onTabChange={onFilingTabChange ?? (() => {})}
    />
  );
};
