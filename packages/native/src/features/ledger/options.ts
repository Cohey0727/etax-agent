import { ACCOUNT_NAMES, TAX_CATEGORIES } from "@etax/shared";
import { LedgerTransaction, LedgerTransactionInput } from "@/api";

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

export const BUSINESS_RATIO_GUIDE_CATEGORIES: ReadonlySet<string> = new Set([
  "地代家賃",
  "水道光熱費",
  "通信費",
  "車両費",
  "租税公課",
  "保険料",
]);

export const BUSINESS_RATIO_GUIDE_TEXT =
  "家事按分がある場合は事業割合を設定してください（例: 家賃は面積割合、通信費は使用時間割合）";

export function incomeTypeLabel(value: string): string {
  return INCOME_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function toInput(row: LedgerTransaction): LedgerTransactionInput {
  return {
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
  };
}

export function emptyDraft(fiscalYear: number): LedgerTransactionInput {
  return {
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
  };
}
