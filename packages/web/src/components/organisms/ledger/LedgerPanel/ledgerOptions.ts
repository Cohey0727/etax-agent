import { ACCOUNT_NAMES, TAX_CATEGORIES } from "@etax/shared";
import { LedgerTransaction, LedgerTransactionInput } from "@types";

/**
 * ledgerOptions.ts — 帳簿画面の選択肢と行変換ヘルパー。
 */

export const INCOME_TYPE_OPTIONS = [
  { value: "business", label: "事業" },
  { value: "real_estate", label: "不動産" },
  { value: "other", label: "対象外" },
] as const;

export const CATEGORY_OPTIONS: readonly string[] = ["未分類", ...ACCOUNT_NAMES];

export const TAX_CATEGORY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "未設定" },
  ...TAX_CATEGORIES.map((name) => ({ value: name, label: name })),
];

// 1行にセレクトや入力が並ぶため、全件を一度に描画すると画面が重くなる。
// 1ページこの件数だけ描画するページネーションにする（集計は全件のまま）。
export const PAGE_SIZE = 100;

export const toInput = (row: LedgerTransaction): LedgerTransactionInput => ({
  date: row.date,
  fiscal_year: row.fiscal_year,
  description: row.description,
  amount: row.amount,
  account: row.account,
  category: row.category,
  income_type: row.income_type,
  tax_category: row.tax_category,
});

export const emptyDraft = (fiscalYear: number): LedgerTransactionInput => ({
  date: `${fiscalYear}-01-01`,
  fiscal_year: fiscalYear,
  description: "",
  amount: 0,
  account: "手入力",
  category: "未分類",
  income_type: "business",
  tax_category: "",
});

/** ページネーションの並び。先頭・末尾と現在ページの前後だけ出し、間は「…」で畳む。 */
export function pageList(current: number, total: number): readonly (number | "gap")[] {
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (const page of pages) {
    const prev = items[items.length - 1];
    if (typeof prev === "number" && page - prev > 1) items.push("gap");
    items.push(page);
  }
  return items;
}
