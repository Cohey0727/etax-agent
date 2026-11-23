import {
  BlueDeductionOptions,
  IncomeTaxResult,
  MiscIncomeInput,
  Transaction,
  computeCorrectedFigures,
  filterYear,
} from "@etax/shared";
import { FilingSnapshotFigures } from "@types";

/**
 * 確定スナップショット用の計算結果を組み立てる。
 * 所得の内訳は帳簿から（IncomeSummary と同じ計算）、税額は計算結果から取る。
 * 取引が無い年や計算結果が無い場合は null（スナップショットを作らない）。
 */
export const buildSnapshotFigures = (
  transactions: Transaction[],
  year: number,
  filingOptions: BlueDeductionOptions | undefined,
  miscIncome: MiscIncomeInput | undefined,
  taxResult: IncomeTaxResult | undefined,
): FilingSnapshotFigures | null => {
  if (!taxResult) return null;
  const yearTransactions = filterYear(transactions, year);
  if (yearTransactions.length === 0) return null;
  const figures = computeCorrectedFigures(yearTransactions, year, filingOptions);
  const misc = miscIncome?.income ?? 0;
  return {
    business_income: figures._detail.business_income,
    real_estate_income: figures._detail.real_estate_income,
    misc_income: misc,
    total_income: figures._detail.business_income + figures._detail.real_estate_income + misc,
    total_deductions: taxResult.deductionsTotal,
    taxable_income: taxResult.taxableIncome,
    final_tax: taxResult.finalTax,
  };
};
