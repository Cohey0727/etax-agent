import { CsvImportPanel } from "@components/organisms/import";
import { ViewPageProps } from "@types";

export const ImportPage = ({ onUseTransactions, onUseImportedCsv, onLoadSample }: ViewPageProps) => {
  return (
    <CsvImportPanel
      onUseTransactions={onUseTransactions}
      onUseImportedCsv={onUseImportedCsv}
      onLoadSample={onLoadSample}
    />
  );
};
