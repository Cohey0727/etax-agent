import { LedgerPanel } from "@components/organisms/ledger";
import { ViewPageProps } from "@types";

export const LedgerPage = ({ transactions, year, onSyncTransactions }: ViewPageProps) => {
  return (
    <LedgerPanel transactions={transactions} year={year} onSyncTransactions={onSyncTransactions} />
  );
};
