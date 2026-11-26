import {
  ComputeCorrectedFiguresOptions,
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  IncomeTaxResult,
  MiscIncomeInput,
  SalaryIncomeInput,
  Transaction,
  computeCorrectedFigures,
  computeManualIncomes,
  filterYear,
} from "@etax/shared";
import { FilingSnapshotFigures } from "@/api";

/**
 * 確定スナップショット用の計算結果を組み立てる。
 * 所得の内訳は帳簿から（IncomeSummary と同じ計算）、税額は計算結果から取る。
 * 取引が無い年や計算結果が無い場合は null（スナップショットを作らない）。
 */
export function buildSnapshotFigures(
  transactions: Transaction[],
  year: number,
  filingOptions: ComputeCorrectedFiguresOptions | undefined,
  miscIncome: MiscIncomeInput | undefined,
  taxResult: IncomeTaxResult | undefined,
  salaryIncome?: SalaryIncomeInput,
): FilingSnapshotFigures | null {
  if (!taxResult) return null;
  const yearTransactions = filterYear(transactions, year);
  if (yearTransactions.length === 0) return null;
  const figures = computeCorrectedFigures(yearTransactions, year, filingOptions);
  const manual = computeManualIncomes(
    year,
    salaryIncome ?? EMPTY_SALARY_INCOME,
    miscIncome ?? EMPTY_MISC_INCOME,
    figures._detail.business_income +
      figures._detail.real_estate_income +
      figures._detail.agriculture_income,
  );
  return {
    business_income: figures._detail.business_income,
    real_estate_income: figures._detail.real_estate_income,
    misc_income: manual.miscTotal,
    total_income: taxResult.totalIncome,
    total_deductions: taxResult.deductionsTotal,
    taxable_income: taxResult.taxableIncome,
    final_tax: taxResult.finalTax,
  };
}
