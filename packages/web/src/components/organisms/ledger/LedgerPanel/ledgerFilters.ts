import { normalizeSearchText, taxCategorySignMismatch } from "@etax/shared";
import { LedgerTransaction } from "@types";

/**
 * ledgerFilters.ts — 帳簿画面のフィルター定義と、URLクエリとの変換。
 *
 * Notion式フィルター1件。項目は1つずつ選んで追加し、同じ項目は1つだけ。
 * 条件の値はすべて文字列で持ち、URLクエリへそのまま出し入れする。
 * 勘定科目・区分・税区分は複数選択（values が空なら「すべて」）。
 */
export type LedgerFilter =
  | { field: "year"; value: string }
  | { field: "period"; from: string; to: string }
  | { field: "amount"; min: string; max: string }
  | { field: "category"; values: string[] }
  | { field: "incomeType"; values: string[] }
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
      return { field, value: "" };
    case "period":
      return { field, from: "", to: "" };
    case "amount":
      return { field, min: "", max: "" };
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
  if (!yearFilter || yearFilter.field !== "year" || !yearFilter.value) return null;
  const year = Number(yearFilter.value);
  return Number.isInteger(year) ? year : null;
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
      return filter.value === "" || row.fiscal_year === Number(filter.value);
    case "period":
      return (!filter.from || row.date >= filter.from) && (!filter.to || row.date <= filter.to);
    case "amount": {
      const min = filter.min.trim() === "" ? null : Number(filter.min);
      const max = filter.max.trim() === "" ? null : Number(filter.max);
      if (min !== null && Number.isFinite(min) && row.amount < min) return false;
      if (max !== null && Number.isFinite(max) && row.amount > max) return false;
      return true;
    }
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
        return { field, value: /^\d{4}$/.test(value) ? value : "" };
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
        return { field, min: params.get("amin") ?? "", max: params.get("amax") ?? "" };
      case "category":
        return { field, values: params.getAll("cat") };
      case "incomeType":
        return { field, values: params.getAll("itype") };
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
          if (filter.value) params.set("year", filter.value);
          break;
        case "period":
          if (filter.from) params.set("from", filter.from);
          if (filter.to) params.set("to", filter.to);
          break;
        case "amount":
          if (filter.min) params.set("amin", filter.min);
          if (filter.max) params.set("amax", filter.max);
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
