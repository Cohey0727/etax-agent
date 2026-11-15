import { LedgerPanel } from "@components/organisms/ledger";
import { ViewPageProps } from "@types";

/** 帳簿は全年度をひとつの画面で管理する（年度は各取引への割り当て）。 */
export const LedgerPage = ({ onSyncTransactions, onNavigate }: ViewPageProps) => {
  return <LedgerPanel onSyncTransactions={onSyncTransactions} onNavigate={onNavigate} />;
};
