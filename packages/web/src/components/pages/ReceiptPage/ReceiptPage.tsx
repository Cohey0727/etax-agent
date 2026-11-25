import { Col } from "@components/atoms";
import { ReceiptLibraryPanel, ReceiptPanel } from "@components/organisms/receipt";
import { ViewPageProps } from "@types";

export const ReceiptPage = ({
  transactions,
  year,
  onUseTransactions,
  onRegisterTransactions,
}: ViewPageProps) => {
  return (
    <Col gap="md">
      {/* 登録しても画面に留まる経路を優先する（続けて撮影・登録できるように）。 */}
      <ReceiptPanel
        transactions={transactions}
        onUseTransactions={onRegisterTransactions ?? onUseTransactions}
      />
      <ReceiptLibraryPanel year={year} />
    </Col>
  );
};
