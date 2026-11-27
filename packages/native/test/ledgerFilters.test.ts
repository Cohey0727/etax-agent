import { describe, expect, test } from "bun:test";
import type { LedgerTransaction } from "@etax/shared/apiWire";
import {
  applyLedgerFilters,
  LedgerFilters,
  LedgerSignFilter,
} from "../src/features/ledger/LedgerScreen/useLedgerFilters";

const base: LedgerFilters = {
  query: "",
  categories: [],
  incomeType: null,
  sign: LedgerSignFilter.All,
  periodFrom: "",
  periodTo: "",
  amountMin: "",
  amountMax: "",
  taxCategories: [],
  mismatchOnly: false,
};

const row = (id: number, amount: number, income_type: LedgerTransaction["income_type"]): LedgerTransaction => ({
  id,
  date: "2025-04-01",
  fiscal_year: 2025,
  description: `取引${id}`,
  amount,
  account: "口座",
  category: "売上高",
  income_type,
  tax_category: "",
  business_ratio_percent: 100,
  business_ratio_basis: "",
  import_id: null,
  created_at: "2025-04-01T00:00:00.000Z",
  updated_at: "2025-04-01T00:00:00.000Z",
  deleted_at: null,
});

const rows = [row(1, 1000, "business"), row(2, -500, "business"), row(3, 80000, "real_estate"), row(4, 0, "other")];
const ids = (filters: LedgerFilters) => applyLedgerFilters(rows, filters).map((r) => r.id);

describe("applyLedgerFilters", () => {
  test("所得区分が null なら絞らず、指定すればその区分だけ残す", () => {
    expect(ids(base)).toEqual([1, 2, 3, 4]);
    expect(ids({ ...base, incomeType: "real_estate" })).toEqual([3]);
  });

  test("収支は収入（正）・支出（負）で絞り、0 円はどちらにも入れない", () => {
    expect(ids({ ...base, sign: LedgerSignFilter.Income })).toEqual([1, 3]);
    expect(ids({ ...base, sign: LedgerSignFilter.Expense })).toEqual([2]);
  });
});
