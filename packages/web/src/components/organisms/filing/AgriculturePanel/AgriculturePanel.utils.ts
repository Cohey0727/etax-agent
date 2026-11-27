import { AGRICULTURE_EXPENSE_CATEGORIES } from "@etax/shared";

/**
 * 経費の科目別合計に金額を入れる。様式の固定科目は一覧に常に出るので、0 なら
 * 持たない。追加科目は科目名ごと持ち続ける（金額欄を空にしている途中で
 * 行が消えないように）。追加科目を消すのは removeAgricultureExpense だけ。
 */
export function setAgricultureExpense(
  expenseTotals: Record<string, number>,
  category: string,
  amount: number,
): Record<string, number> {
  if (amount === 0 && AGRICULTURE_EXPENSE_CATEGORIES.includes(category)) {
    return removeAgricultureExpense(expenseTotals, category);
  }
  return { ...expenseTotals, [category]: amount };
}

/** 経費の科目別合計から科目を消す。 */
export function removeAgricultureExpense(
  expenseTotals: Record<string, number>,
  category: string,
): Record<string, number> {
  const next = { ...expenseTotals };
  delete next[category];
  return next;
}
