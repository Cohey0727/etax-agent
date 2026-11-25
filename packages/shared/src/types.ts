/**
 * types.ts — 取引・計算結果の共通型。
 *
 * 取引の約束事:
 *   amount が正 = 収入（売上・家賃収入など）、負 = 経費（支出）。いずれも税込金額。
 *   income_type は "business"（事業所得）/ "real_estate"（不動産所得）/ "other"。
 */

export type IncomeType = "business" | "real_estate" | "other";

export interface Transaction {
  /** YYYY-MM-DD */
  date: string;
  /**
   * 割り当て年度（この取引を計上する年）。既定は日付の年だが、
   * 年末のカード利用などでは日付と違う年へ割り当てることがある。
   * 集計（filterYear）はこの値で効く。
   */
  year: number;
  description: string;
  /** 符号つき税込金額（収入は正、支出は負） */
  amount: number;
  account: string;
  category: string;
  income_type: IncomeType;
  /**
   * 消費税の税区分（freee の表記そのまま）。消費税申告の金額は
   * この区分で帳簿を集計して決める。"" は未設定（集計から漏れる）。
   */
  tax_category: string;
  /**
   * 事業専用割合（家事按分、0〜100の整数）。未指定は 100（全額が事業分）。
   * 集計は taxcalc の transactionBusinessAmount 経由で事業分だけを
   * 収入・経費に算入する（私用分は経費に含めない）。
   */
  business_ratio_percent?: number;
  /** 按分根拠のメモ（例: 面積割合 20㎡/60㎡）。任意。集計には使わない。 */
  business_ratio_basis?: string;
}

/** 税区分の選択肢（"" は未設定）。帳簿の編集や取込マッピングで使う。 */
export const TAX_CATEGORIES: readonly string[] = [
  "課税売上10%",
  "課税売上8%",
  "非課売上",
  "免税売上",
  "課対仕入10%",
  "課対仕入8%",
  "対象外",
];

export const VALID_INCOME_TYPES: ReadonlySet<string> = new Set([
  "business",
  "real_estate",
  "other",
]);
