import { ConsumptionTaxPanel, SubmissionRecordPanel } from "@components/organisms/filing";
import { FilingTabProps } from "../FilingTabProps";

/** 確定申告画面の「消費税」タブ。消費税申告書の作成と提出の記録を並べる。 */
export const FilingConsumptionTab = ({ year, transactions, deduction, onOpenLedger }: FilingTabProps) => (
  <>
    <ConsumptionTaxPanel
      transactions={transactions}
      year={year}
      onOpenLedger={onOpenLedger}
      consumptionFiling={deduction.state.consumptionFiling}
      onConsumptionFilingChange={(next) => deduction.update({ consumptionFiling: next })}
    />
    <SubmissionRecordPanel year={year} kind="consumption" />
  </>
);
