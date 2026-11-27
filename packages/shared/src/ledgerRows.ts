/**
 * ledgerRows.ts — 帳簿の行（API のワイヤ形式）と画面共通の Transaction の変換と、
 * 選択欄などから受け取った文字列を収入区分・所得区分として受け取る判定。
 */
import type { LedgerTransaction, LedgerTransactionInput } from "./apiWire";
import { FIXED_ASSET_INCOME_TYPE_LABELS, type FixedAssetIncomeType } from "./fixedAssetLedger";
import { type IncomeType, type Transaction, VALID_INCOME_TYPES } from "./types";

/** 選択欄などから受け取った文字列が、取引の収入区分の値か。 */
export function isIncomeType(value: string): value is IncomeType {
  return VALID_INCOME_TYPES.has(value);
}

/** 選択欄などから受け取った文字列が、固定資産の所得区分の値か。 */
export function isFixedAssetIncomeType(value: string): value is FixedAssetIncomeType {
  return Object.prototype.hasOwnProperty.call(FIXED_ASSET_INCOME_TYPE_LABELS, value);
}

/** 帳簿の行を画面共通の Transaction へ変換する。 */
export function ledgerRowToTransaction(row: LedgerTransaction): Transaction {
  return {
    date: row.date,
    year: row.fiscal_year,
    description: row.description,
    amount: row.amount,
    account: row.account,
    category: row.category,
    // DB の列は text なので、収入区分の値でないものは other として扱う
    income_type: VALID_INCOME_TYPES.has(row.income_type) ? row.income_type : "other",
    tax_category: row.tax_category,
    business_ratio_percent: row.business_ratio_percent,
    business_ratio_basis: row.business_ratio_basis,
  };
}

/** 画面共通の Transaction を帳簿保存用の入力へ変換する。 */
export function transactionToLedgerInput(tx: Transaction): LedgerTransactionInput {
  return {
    date: tx.date,
    fiscal_year: tx.year,
    description: tx.description,
    amount: tx.amount,
    account: tx.account,
    category: tx.category,
    income_type: tx.income_type,
    tax_category: tx.tax_category,
    business_ratio_percent: tx.business_ratio_percent ?? 100,
    business_ratio_basis: tx.business_ratio_basis ?? "",
  };
}
