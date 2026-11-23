import { Col } from "@components/atoms";
import { ReceiptLibraryPanel, ReceiptPanel } from "@components/organisms/receipt";
import { ViewPageProps } from "@types";

export const ReceiptPage = ({ transactions, year, onUseTransactions }: ViewPageProps) => {
  return (
    <Col gap="md">
      <ReceiptPanel transactions={transactions} onUseTransactions={onUseTransactions} />
      <ReceiptLibraryPanel year={year} />
    </Col>
  );
};
