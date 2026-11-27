/**
 * trialBalanceRows.ts — 残高試算表の損益計算書（1区分）を、当年と前年を
 * 並べた表の行にする。並びは決算書と同じ（収入→仕入→経費→差引→青色申告
 * 特別控除→所得）。Web と native の試算表画面が共有する。
 */
import { TrialBalanceLine, TrialBalancePl } from "./trialBalance";

export type TrialBalanceRowKind = "line" | "subtotal" | "total";

export interface TrialBalanceComparisonRow {
  /** 一覧の key（表の中で一意） */
  key: string;
  label: string;
  current: number;
  previous: number;
  kind: TrialBalanceRowKind;
  /** ドリルダウン先の帳簿で絞り込む勘定科目。無い行は遷移できない */
  categories?: string[];
}

export function trialBalancePlRows(
  current: TrialBalancePl,
  previous: TrialBalancePl,
): TrialBalanceComparisonRow[] {
  const rows: TrialBalanceComparisonRow[] = [];
  rows.push({
    key: "revenue",
    label: "売上（収入）金額",
    current: current.revenue,
    previous: previous.revenue,
    kind: "subtotal",
  });
  rows.push(...lineRows("revenue", current.revenue_lines, previous.revenue_lines));
  if (current.purchases > 0 || previous.purchases > 0) {
    rows.push({
      key: "purchases",
      label: "仕入高",
      current: current.purchases,
      previous: previous.purchases,
      kind: "line",
      categories: ["仕入高"],
    });
    rows.push({
      key: "gross-profit",
      label: "差引金額（売上総利益）",
      current: current.revenue - current.purchases,
      previous: previous.revenue - previous.purchases,
      kind: "subtotal",
    });
  }
  rows.push(...lineRows("expense", current.expense_lines, previous.expense_lines));
  rows.push({
    key: "expenses",
    label: "経費計",
    current: current.expenses,
    previous: previous.expenses,
    kind: "subtotal",
  });
  rows.push({
    key: "income-before-blue",
    label: "差引金額",
    current: current.income_before_blue,
    previous: previous.income_before_blue,
    kind: "subtotal",
  });
  rows.push({
    key: "blue-deduction",
    label: "青色申告特別控除",
    current: current.blue_deduction,
    previous: previous.blue_deduction,
    kind: "line",
  });
  rows.push({
    key: "income",
    label: "所得金額",
    current: current.income,
    previous: previous.income,
    kind: "total",
  });
  return rows;
}

function lineRows(
  section: "revenue" | "expense",
  current: readonly TrialBalanceLine[],
  previous: readonly TrialBalanceLine[],
): TrialBalanceComparisonRow[] {
  return current.map((line) => ({
    key: `${section}:${line.category}`,
    label: line.category,
    current: line.amount,
    previous: previous.find((p) => p.category === line.category)?.amount ?? 0,
    kind: "line",
    categories: line.categories,
  }));
}
