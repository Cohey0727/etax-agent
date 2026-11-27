import { IncomeType, isIncomeType, normalizeSearchText, taxCategorySignMismatch } from "@etax/shared";
import { LedgerTransaction } from "@types";

/**
 * ledgerFilters.ts — 帳簿画面のフィルター定義と、URLクエリとの変換。
 *
 * Notion式フィルター1件。項目は1つずつ選んで追加し、同じ項目は1つだけ。
 * 年度・金額は数値で持ち、指定なしは null。URLクエリとは読み書きのときに変換する。
 * 勘定科目・区分・税区分は複数選択（values が空なら「すべて」）。
 */
export type LedgerFilter =
  | { field: "year"; value: number | null }
  | { field: "period"; from: string; to: string }
  | { field: "amount"; min: number | null; max: number | null }
  | { field: "category"; values: string[] }
  | { field: "incomeType"; values: IncomeType[] }
  | { field: "taxCategory"; values: string[] }
  | { field: "mismatch" };

export type LedgerFilterField = LedgerFilter["field"];

export const FILTER_FIELDS: readonly LedgerFilterField[] = [
  "year",
  "period",
  "amount",
  "category",
  "incomeType",
  "taxCategory",
  "mismatch",
];

export const FILTER_FIELD_LABELS: Record<LedgerFilterField, string> = {
  year: "年度",
  period: "期間",
  amount: "金額",
  category: "勘定科目",
  incomeType: "区分",
  taxCategory: "税区分",
  mismatch: "税区分の符号不一致",
};

export const emptyFilter = (field: LedgerFilterField): LedgerFilter => {
  switch (field) {
    case "year":
      return { field, value: null };
    case "period":
      return { field, from: "", to: "" };
    case "amount":
      return { field, min: null, max: null };
    case "category":
      return { field, values: ["未分類"] };
    case "incomeType":
      return { field, values: ["business"] };
    case "taxCategory":
      return { field, values: [] };
    case "mismatch":
      return { field };
  }
};

/** 年度フィルターで選ばれている年度（未選択・全年度なら null）。 */
export const activeYearOf = (filters: readonly LedgerFilter[]): number | null => {
  const yearFilter = filters.find((f) => f.field === "year");
  return yearFilter?.field === "year" ? yearFilter.value : null;
};

/** 検索・フィルターを適用した表示用の行を作る。 */
export const filterRows = (
  rows: readonly LedgerTransaction[],
  query: string,
  filters: readonly LedgerFilter[],
): LedgerTransaction[] => {
  // 全角英数・半角カタカナでも当たるよう、クエリと対象の両方を正規化する。
  const normalizedQuery = normalizeSearchText(query.trim());
  return rows.filter((row) => {
    if (!filters.every((filter) => matchesFilter(row, filter))) return false;
    if (!normalizedQuery) return true;
    return [row.description, row.category, row.account, row.tax_category].some((value) =>
      normalizeSearchText(value).includes(normalizedQuery),
    );
  });
};

/** 取引がフィルター1件に一致するか。金額は符号付きで比べる（支出はマイナス）。 */
export function matchesFilter(row: LedgerTransaction, filter: LedgerFilter): boolean {
  switch (filter.field) {
    case "year":
      return filter.value === null || row.fiscal_year === filter.value;
    case "period":
      return (!filter.from || row.date >= filter.from) && (!filter.to || row.date <= filter.to);
    case "amount":
      return (
        (filter.min === null || row.amount >= filter.min) &&
        (filter.max === null || row.amount <= filter.max)
      );
    case "category":
      return filter.values.length === 0 || filter.values.includes(row.category);
    case "incomeType":
      return filter.values.length === 0 || filter.values.includes(row.income_type);
    case "taxCategory":
      return filter.values.length === 0 || filter.values.includes(row.tax_category);
    case "mismatch":
      return taxCategorySignMismatch(row);
  }
}

/** URLクエリから検索・フィルターの初期状態を読む。不正な値は落とす。 */
export function parseFiltersFromSearch(search: string): { query: string; filters: LedgerFilter[] } {
  const params = new URLSearchParams(search);
  // 期間フィルターは常設（消せない）。指定が無くても必ず先頭に入れる。
  if (params.get("filters") === null) {
    return { query: params.get("q") ?? "", filters: [emptyFilter("period")] };
  }
  const requested = (params.get("filters") ?? "")
    .split(",")
    .filter(
      (field, index, all) =>
        FILTER_FIELDS.includes(field as LedgerFilterField) && all.indexOf(field) === index,
    );
  const filters: LedgerFilter[] = requested.map((rawField) => {
    const field = rawField as LedgerFilterField;
    switch (field) {
      case "year": {
        const value = params.get("year") ?? "";
        return { field, value: /^\d{4}$/.test(value) ? Number(value) : null };
      }
      case "period": {
        const from = params.get("from") ?? "";
        const to = params.get("to") ?? "";
        return {
          field,
          from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : "",
          to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : "",
        };
      }
      case "amount":
        return { field, min: amountParam(params, "amin"), max: amountParam(params, "amax") };
      case "category":
        return { field, values: params.getAll("cat") };
      case "incomeType":
        return { field, values: params.getAll("itype").filter(isIncomeType) };
      case "taxCategory":
        return { field, values: params.getAll("tax") };
      case "mismatch":
        return { field };
    }
  });
  if (!filters.some((f) => f.field === "period")) {
    filters.unshift(emptyFilter("period"));
  }
  return { query: params.get("q") ?? "", filters };
}

/** 検索・フィルターの状態をURLクエリ文字列にする。 */
export function buildFilterSearch(query: string, filters: LedgerFilter[]): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (filters.length > 0) {
    params.set("filters", filters.map((f) => f.field).join(","));
    for (const filter of filters) {
      switch (filter.field) {
        case "year":
          if (filter.value !== null) params.set("year", String(filter.value));
          break;
        case "period":
          if (filter.from) params.set("from", filter.from);
          if (filter.to) params.set("to", filter.to);
          break;
        case "amount":
          if (filter.min !== null) params.set("amin", String(filter.min));
          if (filter.max !== null) params.set("amax", String(filter.max));
          break;
        case "category":
          for (const value of filter.values) params.append("cat", value);
          break;
        case "incomeType":
          for (const value of filter.values) params.append("itype", value);
          break;
        case "taxCategory":
          for (const value of filter.values) params.append("tax", value);
          break;
        case "mismatch":
          break;
      }
    }
  }
  return params.toString();
}

/** URLクエリの金額の条件。空・数として読めない値は指定なし（null）。 */
function amountParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key)?.trim() ?? "";
  const value = Number(raw);
  return raw === "" || !Number.isFinite(value) ? null : value;
}
