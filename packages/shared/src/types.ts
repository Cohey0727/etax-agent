/**
 * types.ts — 取引・計算結果の共通型。
 * Python 版（kakutei-agent）の dict 形式に対応する。
 *
 * 取引の約束事:
 *   amount が正 = 収入（売上・家賃収入など）、負 = 経費（支出）。いずれも税込金額。
 *   income_type は "business"（事業所得）/ "real_estate"（不動産所得）/ "other"。
 */

export type IncomeType = "business" | "real_estate" | "other";

export interface Transaction {
  /** YYYY-MM-DD */
  date: string;
  year: number;
  description: string;
  /** 符号つき税込金額（収入は正、支出は負） */
  amount: number;
  account: string;
  category: string;
  income_type: IncomeType;
}

export const VALID_INCOME_TYPES: ReadonlySet<string> = new Set([
  "business",
  "real_estate",
  "other",
]);
