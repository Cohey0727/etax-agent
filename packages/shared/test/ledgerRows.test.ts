import { describe, expect, test } from "bun:test";
import type { LedgerTransaction } from "../src/apiWire";
import {
  isFixedAssetIncomeType,
  isIncomeType,
  ledgerRowToTransaction,
  transactionToLedgerInput,
} from "../src/index";

const row: LedgerTransaction = {
  id: 1,
  date: "2025-12-30",
  fiscal_year: 2026,
  description: "サーバー利用料",
  amount: -3300,
  account: "カード",
  category: "通信費",
  income_type: "business",
  tax_category: "課対仕入10%",
  business_ratio_percent: 50,
  business_ratio_basis: "使用時間",
  import_id: null,
  created_at: "2025-12-31T00:00:00.000Z",
  updated_at: "2025-12-31T00:00:00.000Z",
  deleted_at: null,
};

describe("帳簿の行の変換", () => {
  test("割り当て年度・事業割合・按分根拠を Transaction へ写す", () => {
    expect(ledgerRowToTransaction(row)).toEqual({
      date: "2025-12-30",
      year: 2026,
      description: "サーバー利用料",
      amount: -3300,
      account: "カード",
      category: "通信費",
      income_type: "business",
      tax_category: "課対仕入10%",
      business_ratio_percent: 50,
      business_ratio_basis: "使用時間",
    });
  });

  test("Transaction から帳簿の入力へ戻すと、元の行の入力項目と一致する", () => {
    const input = transactionToLedgerInput(ledgerRowToTransaction(row));
    expect(input).toEqual({
      date: row.date,
      fiscal_year: row.fiscal_year,
      description: row.description,
      amount: row.amount,
      account: row.account,
      category: row.category,
      income_type: row.income_type,
      tax_category: row.tax_category,
      business_ratio_percent: row.business_ratio_percent,
      business_ratio_basis: row.business_ratio_basis,
    });
  });

  test("事業割合・按分根拠が未指定の Transaction は 100% と空文字で保存する", () => {
    const { business_ratio_percent, business_ratio_basis, ...rest } = ledgerRowToTransaction(row);
    expect(business_ratio_percent).toBe(50);
    expect(business_ratio_basis).toBe("使用時間");
    const input = transactionToLedgerInput(rest);
    expect(input.business_ratio_percent).toBe(100);
    expect(input.business_ratio_basis).toBe("");
  });

  test("DB に収入区分でない値が入っていたら other として扱う", () => {
    const legacy = { ...row, income_type: "unknown" } as unknown as LedgerTransaction;
    expect(ledgerRowToTransaction(legacy).income_type).toBe("other");
  });
});

describe("選択欄の値の判定", () => {
  test("取引の収入区分", () => {
    expect(["business", "real_estate", "other", "agriculture", ""].map(isIncomeType)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  test("固定資産の所得区分", () => {
    expect(["business", "real_estate", "agriculture", "other", "toString"].map(isFixedAssetIncomeType)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});
