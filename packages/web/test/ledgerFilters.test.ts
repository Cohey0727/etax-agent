/**
 * ledgerFilters.test.ts — 帳簿の絞り込み条件と URL クエリの変換、行の照合の検証。
 */
import { describe, expect, test } from "bun:test";
import {
  activeYearOf,
  buildFilterSearch,
  filterRows,
  parseFiltersFromSearch,
} from "../src/components/organisms/ledger/LedgerPanel/ledgerFilters";
import { LedgerTransaction } from "../src/types";

const row = (id: number, partial: Partial<LedgerTransaction>): LedgerTransaction => ({
  id,
  date: "2025-04-01",
  fiscal_year: 2025,
  description: `取引${id}`,
  amount: -1000,
  account: "カード",
  category: "通信費",
  income_type: "business",
  tax_category: "",
  business_ratio_percent: 100,
  business_ratio_basis: "",
  import_id: null,
  created_at: "",
  ...partial,
});

describe("parseFiltersFromSearch / buildFilterSearch", () => {
  test("年度・金額の条件を URL から読み、同じクエリに戻せる", () => {
    const search = "filters=period%2Cyear%2Camount&year=2025&amin=-5000&amax=0";
    const { filters } = parseFiltersFromSearch(`?${search}`);
    expect(activeYearOf(filters)).toBe(2025);
    expect(buildFilterSearch("", filters)).toBe(search);
  });

  test("年度の形でない値・空の金額は条件なしとして読む", () => {
    const { filters } = parseFiltersFromSearch("?filters=year,amount&year=20x5");
    expect(activeYearOf(filters)).toBeNull();
    expect(buildFilterSearch("", filters)).toBe("filters=period%2Cyear%2Camount");
  });
});

describe("filterRows", () => {
  test("金額は符号付きで比べ、年度は割り当て年度で比べる", () => {
    const rows = [
      row(1, { amount: -8000 }),
      row(2, { amount: -3000 }),
      row(3, { amount: 5000, fiscal_year: 2024 }),
    ];
    const { filters } = parseFiltersFromSearch("?filters=amount&amin=-5000&amax=10000");
    expect(filterRows(rows, "", filters).map((r) => r.id)).toEqual([2, 3]);
    const byYear = parseFiltersFromSearch("?filters=year&year=2024").filters;
    expect(filterRows(rows, "", byYear).map((r) => r.id)).toEqual([3]);
  });
});
