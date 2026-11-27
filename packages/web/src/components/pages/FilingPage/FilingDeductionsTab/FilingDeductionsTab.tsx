import { applyBreakdownEntries } from "@etax/shared";
import { Card } from "@components/atoms";
import {
  AgriculturePanel,
  ConfirmComparePanel,
  DeductionPanel,
  ExpandedIncomePanel,
  FilingStatusToggle,
  MiscIncomePanel,
  SalaryPanel,
  TaxCreditPanel,
} from "@components/organisms/filing";
import { FilingTabProps } from "../FilingTabProps";

/** 確定申告画面の「控除」タブ。帳簿の外の所得・所得控除・税額控除を入れ、計算を確定する。 */
export const FilingDeductionsTab = ({
  year,
  deduction,
  figures,
  filingStatus,
  onToggleStatus,
  snapshots,
  currentFigures,
}: FilingTabProps) => {
  const state = deduction.state;
  return (
    <>
      <SalaryPanel
        year={year}
        salaryIncome={state.salaryIncome}
        onChange={(next) => deduction.update({ salaryIncome: next })}
      />
      <MiscIncomePanel
        miscIncome={state.miscIncome}
        onChange={(next) => deduction.update({ miscIncome: next })}
      />
      <ExpandedIncomePanel
        expandedIncome={state.expandedIncome}
        breakdown={figures.expanded}
        taxResult={figures.taxResult}
        onChange={(next) => deduction.update({ expandedIncome: next })}
      />
      <AgriculturePanel
        agriculture={state.agriculture}
        filingType={state.filingType}
        onChange={(next) => deduction.update({ agriculture: next })}
      />
      <DeductionPanel
        year={year}
        deductions={state.deductions}
        breakdown={figures.taxResult.deductions}
        onChange={(next) => deduction.update({ deductions: next })}
        breakdownEntries={{
          donations: state.donationEntries,
          socialInsurance: state.socialInsuranceEntries,
          mutualAid: state.mutualAidEntries,
          medical: state.medicalEntries,
        }}
        onBreakdownEntriesChange={(key, entries) =>
          deduction.replace(applyBreakdownEntries(state, key, entries))
        }
      />
      <TaxCreditPanel
        year={year}
        taxCredits={state.taxCredits}
        result={figures.taxResult}
        dividendCreditDerived={figures.expanded.dividendDeclared}
        onChange={(next) => deduction.update({ taxCredits: next })}
      />
      <ConfirmComparePanel
        calculated={filingStatus.status.calculated}
        snapshots={snapshots}
        currentFigures={currentFigures}
      />
      <Card>
        <FilingStatusToggle
          statusKey="calculated"
          label="控除・計算"
          description="所得控除・税額控除の入力が終わったら、ここで確定できます（総合・ダッシュボードと共有）。確定すると計算結果が控えられ、再確定のときに前回確定との差分が出ます。"
          filingStatus={filingStatus}
          onToggle={onToggleStatus}
        />
      </Card>
    </>
  );
};
