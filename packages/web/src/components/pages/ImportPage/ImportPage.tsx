import { CsvImportPanel } from "@components/organisms/import";
import { ViewPageProps } from "@types";

export const ImportPage = ({ onUseTransactions, onLoadSample }: ViewPageProps) => {
  return <CsvImportPanel onUseTransactions={onUseTransactions} onLoadSample={onLoadSample} />;
};
