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
  business_ratio_percent: row.business_ratio_percent ?? 100,
  business_ratio_basis: row.business_ratio_basis ?? "",
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
  business_ratio_percent: 100,
  business_ratio_basis: "",
});

/**
 * 家事按分を設定しやすい科目（自宅家賃・光熱費・通信費など）。
 * これらの科目では割合入力の近くに軽いガイドを出す。割合の妥当性は
 * 判定しない（税理士法フェンシング: 案内のみに留める）。
 */
export const BUSINESS_RATIO_GUIDE_CATEGORIES: ReadonlySet<string> = new Set([
  "地代家賃",
  "水道光熱費",
  "通信費",
  "車両費",
  "租税公課",
  "保険料",
]);

/** 按分ガイドの文言（候補科目で割合が100%のときだけ出す）。 */
export const BUSINESS_RATIO_GUIDE_TEXT =
  "家事按分がある場合は事業割合を設定してください（例: 家賃は面積割合、通信費は使用時間割合）";

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
