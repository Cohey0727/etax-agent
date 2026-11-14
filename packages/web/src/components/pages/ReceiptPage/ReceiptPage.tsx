import { ReceiptPanel } from "@components/organisms/receipt";
import { ViewPageProps } from "@types";

export const ReceiptPage = ({ transactions, onUseTransactions }: ViewPageProps) => {
  return <ReceiptPanel transactions={transactions} onUseTransactions={onUseTransactions} />;
};
