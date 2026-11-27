import { FilingPanel, SubmissionRecordPanel, TaxpayerPanel } from "@components/organisms/filing";
import { FilingTabProps } from "../FilingTabProps";

/** 確定申告画面の「総合」タブ。確定の状況と所得・税額の要約、提出の動線を並べる。 */
export const FilingOverviewTab = ({
  year,
  yearTransactions,
  deduction,
  figures,
  filingStatus,
  onToggleStatus,
  snapshots,
  currentFigures,
  onOpenSection,
}: FilingTabProps) => {
  const state = deduction.state;
  return (
    <>
      <FilingPanel
        year={year}
        figures={figures}
        filingType={state.filingType}
        ledgerTransactionCount={yearTransactions.length}
        filingStatus={filingStatus}
        onToggleStatus={onToggleStatus}
        snapshots={snapshots}
        currentFigures={currentFigures}
        onOpenSection={onOpenSection}
      />
      <TaxpayerPanel
        year={year}
        transactions={yearTransactions}
        state={state}
        incomeBeforeBlue={figures.corrected._detail.business_income_before_deduction}
        onIncomeTaxPaymentsChange={(next) => deduction.update({ incomeTaxPayments: next })}
        onOpenSection={onOpenSection}
      />
      <SubmissionRecordPanel year={year} kind="income" />
    </>
  );
};
