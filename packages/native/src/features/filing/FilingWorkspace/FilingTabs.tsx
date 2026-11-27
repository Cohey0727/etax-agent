import { DeductionState, applyBreakdownEntries } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components";
import { space } from "@/theme";
import { AgriculturePanel } from "../AgriculturePanel";
import { BalanceRecords } from "../BalanceRecords";
import { BalanceSheetPanel } from "../BalanceSheetPanel";
import { BalanceSummary } from "../BalanceSummary";
import { ConfirmComparePanel } from "../ConfirmComparePanel";
import { ConsumptionTaxPanel } from "../ConsumptionTaxPanel";
import { DeductionPanel } from "../DeductionPanel";
import { ExpandedIncomePanel } from "../ExpandedIncomePanel";
import { FilingPanel, FilingSection } from "../FilingPanel";
import { FilingStatusToggle } from "../FilingStatusToggle";
import { MiscIncomePanel } from "../MiscIncomePanel";
import { MonthlyBalance } from "../MonthlyBalance";
import { SalaryPanel } from "../SalaryPanel";
import { SectionHead } from "../fields";
import { SubmissionRecordPanel } from "../SubmissionRecordPanel";
import { TaxCreditPanel } from "../TaxCreditPanel";
import { TaxpayerPanel } from "../TaxpayerPanel";
import { FilingModel } from "./useFilingModel";

/** 確定申告画面の各タブが受け取る props（タブの表で同じ形にそろえる）。 */
export interface FilingTabProps {
  model: FilingModel;
  /** 申告入力を、現在の値から次の値を作って保存する。 */
  update: (change: (current: DeductionState) => DeductionState) => void;
  /** 総合タブから各タブ・納税者情報画面へ移る。 */
  onOpenSection: (section: FilingSection) => void;
}

/** 総合タブ: 確定の状況と所得・税額の要約、提出パネル、提出の記録。 */
export function FilingOverviewTab({ model, update, onOpenSection }: FilingTabProps) {
  const { year, yearTransactions, deductionState: state, figures } = model;
  return (
    <>
      <FilingPanel
        year={year}
        figures={figures}
        filingType={state.filingType}
        hasTransactions={yearTransactions.length > 0}
        snapshots={model.snapshots}
        currentFigures={model.currentFigures}
        onConfirmCalculation={model.confirmCalculation}
        onOpenSection={onOpenSection}
      />
      <TaxpayerPanel
        year={year}
        transactions={yearTransactions}
        deductionState={state}
        figures={figures}
        onIncomeTaxPaymentsChange={(next) => update((s) => ({ ...s, incomeTaxPayments: next }))}
        onOpenSection={onOpenSection}
      />
      <SubmissionRecordPanel year={year} kind="income" />
    </>
  );
}

/** 収支タブ: 収支の集計と確定、月別の収支、対象の取引、貸借対照表。 */
export function FilingBalanceTab({ model, update }: FilingTabProps) {
  const { year, yearTransactions, deductionState: state, figures } = model;
  return (
    <>
      <Card>
        <View style={styles.balanceCard}>
          <SectionHead title="収支" />
          <BalanceSummary
            transactions={yearTransactions}
            figures={figures}
            filingType={state.filingType}
          />
          <FilingStatusToggle
            bare
            year={year}
            statusKey="confirmed"
            label="収支"
            description="収支の金額・科目・区分に誤りがないか見直したら、ここで確定できます（総合・ダッシュボードと共有）。"
          />
        </View>
      </Card>
      <MonthlyBalance transactions={yearTransactions} />
      <BalanceRecords key={year} transactions={yearTransactions} />
      <BalanceSheetPanel
        year={year}
        balanceSheet={state.balanceSheet}
        incomeBeforeBlue={figures.corrected._detail.business_income_before_deduction}
        previousIncomeBeforeBlue={model.previousIncomeBeforeBlue}
        filingType={state.filingType}
        onChange={(next) => update((s) => ({ ...s, balanceSheet: next }))}
      />
    </>
  );
}

/** 控除タブ: 帳簿に載らない所得、所得控除・税額控除の入力と、控除・計算の確定。 */
export function FilingDeductionsTab({ model, update }: FilingTabProps) {
  const { year, deductionState: state } = model;
  const { taxResult, expanded: expandedBreakdown } = model.figures;
  return (
    <>
      <SalaryPanel
        year={year}
        salaryIncome={state.salaryIncome}
        onChange={(next) => update((s) => ({ ...s, salaryIncome: next }))}
      />
      <MiscIncomePanel
        miscIncome={state.miscIncome}
        onChange={(next) => update((s) => ({ ...s, miscIncome: next }))}
      />
      <ExpandedIncomePanel
        expandedIncome={state.expandedIncome}
        breakdown={expandedBreakdown}
        taxResult={taxResult}
        onChange={(next) => update((s) => ({ ...s, expandedIncome: next }))}
      />
      <AgriculturePanel
        agriculture={state.agriculture}
        filingType={state.filingType}
        onChange={(next) => update((s) => ({ ...s, agriculture: next }))}
      />
      <DeductionPanel
        year={year}
        deductions={state.deductions}
        breakdown={taxResult.deductions}
        onChange={(next) => update((s) => ({ ...s, deductions: next }))}
        breakdownEntries={{
          donations: state.donationEntries,
          socialInsurance: state.socialInsuranceEntries,
          mutualAid: state.mutualAidEntries,
          medical: state.medicalEntries,
        }}
        onBreakdownEntriesChange={(key, entries) =>
          update((s) => applyBreakdownEntries(s, key, entries))
        }
      />
      <TaxCreditPanel
        year={year}
        taxCredits={state.taxCredits}
        result={taxResult}
        dividendCreditDerived={expandedBreakdown.dividendDeclared}
        onChange={(next) => update((s) => ({ ...s, taxCredits: next }))}
      />
      <ConfirmComparePanel
        year={year}
        snapshots={model.snapshots}
        currentFigures={model.currentFigures}
      />
      <FilingStatusToggle
        year={year}
        statusKey="calculated"
        label="控除・計算"
        description="所得控除・税額控除の入力が終わったら、ここで確定できます（総合・ダッシュボードと共有）。確定すると計算結果が控えられ、再確定のときに前回確定との差分が出ます。"
        onConfirm={model.confirmCalculation}
      />
    </>
  );
}

/** 消費税タブ: 消費税申告書の作成と提出の記録。 */
export function FilingConsumptionTab({ model, update }: FilingTabProps) {
  return (
    <>
      <ConsumptionTaxPanel
        transactions={model.transactions}
        year={model.year}
        consumptionFiling={model.deductionState.consumptionFiling}
        onConsumptionFilingChange={(next) => update((s) => ({ ...s, consumptionFiling: next }))}
      />
      <SubmissionRecordPanel year={model.year} kind="consumption" />
    </>
  );
}

const styles = StyleSheet.create({
  balanceCard: { gap: space.md },
});
