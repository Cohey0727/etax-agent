import { Col } from "@components/atoms";
import { ConsumptionTaxPanel, FilingFlowPanel } from "@components/organisms/filing";
import { ViewPageProps } from "@types";

export const FilingPage = ({ transactions, year, onNavigate }: ViewPageProps) => {
  return (
    <Col gap="md">
      <FilingFlowPanel transactions={transactions} year={year} onNavigate={onNavigate} />
      <ConsumptionTaxPanel transactions={transactions} year={year} />
    </Col>
  );
};
