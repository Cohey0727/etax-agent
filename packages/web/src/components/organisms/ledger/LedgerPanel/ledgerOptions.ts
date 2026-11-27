import { ACCOUNT_NAMES, IncomeType, LEDGER_INCOME_TYPE_LABELS, TAX_CATEGORIES } from "@etax/shared";
import { LedgerTransaction, LedgerTransactionInput } from "@types";

/**
 * ledgerOptions.ts — 帳簿画面の選択肢と行変換ヘルパー。
 */

export const INCOME_TYPE_OPTIONS: readonly { value: IncomeType; label: string }[] = (
  Object.keys(LEDGER_INCOME_TYPE_LABELS) as IncomeType[]
).map((value) => ({ value, label: LEDGER_INCOME_TYPE_LABELS[value] }));

export const CATEGORY_OPTIONS: readonly string[] = ["未分類", ...ACCOUNT_NAMES];

/**
 * 勘定科目の選択肢に、一覧に無い科目（科目推定・CSV の明示列・分類ルールが
 * 付けたもの）を足す。足りないと選択欄が先頭の「未分類」を表示してしまう。
 */
export function categoryOptionsWith(categories: Iterable<string>): string[] {
  const options = [...CATEGORY_OPTIONS];
  for (const category of categories) {
    if (category && !options.includes(category)) options.push(category);
  }
  return options;
}

export const TAX_CATEGORY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "未設定" },
  ...TAX_CATEGORIES.map((name) => ({ value: name, label: name })),
];

// 1行にセレクトや入力が並ぶため、全件を一度に描画すると画面が重くなる。
// 1ページこの件数だけ描画するページネーションにする（集計は全件のまま）。
export const PAGE_SIZE = 100;

/**
 * 入力中の取引。金額・事業割合の欄は空欄（入力途中の「-」を含む）を null で持ち、
 * 保存するときに ledgerDraftToInput で取引入力へ変換する。
 */
export type LedgerRowDraft = Omit<LedgerTransactionInput, "amount" | "business_ratio_percent"> & {
  amount: number | null;
  business_ratio_percent: number | null;
};

export const toDraft = (row: LedgerTransaction): LedgerRowDraft => ({
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

export const emptyDraft = (fiscalYear: number): LedgerRowDraft => ({
  date: `${fiscalYear}-01-01`,
  fiscal_year: fiscalYear,
  description: "",
  amount: null,
  account: "手入力",
  category: "未分類",
  income_type: "business",
  tax_category: "",
  business_ratio_percent: 100,
  business_ratio_basis: "",
});

/** 数値の入力欄の値（valueAsNumber）。数として読めない入力は空欄（null）にする。 */
export const inputNumberOrNull = (valueAsNumber: number): number | null =>
  Number.isNaN(valueAsNumber) ? null : valueAsNumber;

/** 入力中の取引を保存する取引入力にする。足りない項目があればその案内を返す。 */
export function ledgerDraftToInput(
  draft: LedgerRowDraft,
): { input: LedgerTransactionInput } | { error: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return { error: "日付を入力してください" };
  if (!draft.description.trim()) return { error: "摘要を入力してください" };
  const { amount, business_ratio_percent: ratio } = draft;
  if (amount === null || amount === 0) {
    return { error: "金額を入力してください（支出はマイナス）" };
  }
  if (ratio === null || !Number.isInteger(ratio) || ratio < 0 || ratio > 100) {
    return { error: "事業割合は0〜100の整数で入力してください" };
  }
  return { input: { ...draft, amount, business_ratio_percent: ratio } };
}

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
