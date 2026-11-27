import { IncomeType, isIncomeType, normalizeSearchText, taxCategorySignMismatch } from "@etax/shared";
import { useState } from "react";
import { LedgerTransaction } from "@/api";

/** 収支の絞り込み。 */
export const LedgerSignFilter = {
  All: "all",
  Income: "income",
  Expense: "expense",
} as const;

export type LedgerSignFilter = (typeof LedgerSignFilter)[keyof typeof LedgerSignFilter];

/** 収支の絞り込みごとの、残す取引の金額の条件。 */
const signMatches: Record<LedgerSignFilter, (amount: number) => boolean> = {
  all: () => true,
  income: (amount) => amount > 0,
  expense: (amount) => amount < 0,
};

/** 帳簿の絞り込み条件一式。 */
export interface LedgerFilters {
  query: string;
  /** 勘定科目（複数選択、空なら絞らない）。 */
  categories: string[];
  /** 所得区分（null は絞らない）。 */
  incomeType: IncomeType | null;
  /** 収支。 */
  sign: LedgerSignFilter;
  periodFrom: string;
  periodTo: string;
  amountMin: string;
  amountMax: string;
  /** 税区分（複数選択、空なら絞らない）。 */
  taxCategories: string[];
  /** 税区分の符号不一致だけに絞る。 */
  mismatchOnly: boolean;
}

export function useLedgerFilters(initialCategories?: string[], initialIncomeType?: string) {
  const [filters, setFilters] = useState<LedgerFilters>(() => ({
    query: "",
    categories: (initialCategories ?? []).filter((c) => c !== ""),
    incomeType:
      initialIncomeType !== undefined && isIncomeType(initialIncomeType) ? initialIncomeType : null,
    sign: LedgerSignFilter.All,
    periodFrom: "",
    periodTo: "",
    amountMin: "",
    amountMax: "",
    taxCategories: [],
    mismatchOnly: false,
  }));
  const patchFilters = (patch: Partial<LedgerFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));
  return { filters, patchFilters };
}

/** 絞り込み条件を適用する。金額は符号付きで比べる（支出はマイナス）。 */
export function applyLedgerFilters(
  rows: readonly LedgerTransaction[],
  filters: LedgerFilters,
): LedgerTransaction[] {
  const q = normalizeSearchText(filters.query.trim());
  const min = filters.amountMin.trim() === "" ? null : Number(filters.amountMin);
  const max = filters.amountMax.trim() === "" ? null : Number(filters.amountMax);
  return rows.filter((row) => {
    if (filters.categories.length > 0 && !filters.categories.includes(row.category)) return false;
    if (filters.incomeType !== null && row.income_type !== filters.incomeType) return false;
    if (!signMatches[filters.sign](row.amount)) return false;
    if (filters.periodFrom && row.date < filters.periodFrom) return false;
    if (filters.periodTo && row.date > filters.periodTo) return false;
    if (min !== null && Number.isFinite(min) && row.amount < min) return false;
    if (max !== null && Number.isFinite(max) && row.amount > max) return false;
    if (filters.taxCategories.length > 0 && !filters.taxCategories.includes(row.tax_category)) {
      return false;
    }
    if (filters.mismatchOnly && !taxCategorySignMismatch(row)) return false;
    if (!q) return true;
    return [row.description, row.category, row.account, row.tax_category].some((v) =>
      normalizeSearchText(v).includes(q),
    );
  });
}
