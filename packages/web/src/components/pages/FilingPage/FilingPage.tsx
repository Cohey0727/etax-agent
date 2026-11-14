import { Col } from "@components/atoms";
import { ConsumptionTaxPanel, FilingPanel } from "@components/organisms/filing";
import { ViewPageProps } from "@types";

export const FilingPage = ({ transactions, year, onNavigate }: ViewPageProps) => {
  return (
    <Col gap="md">
      <FilingPanel transactions={transactions} year={year} onNavigate={onNavigate} />
      <ConsumptionTaxPanel transactions={transactions} year={year} />
    </Col>
  );
};
