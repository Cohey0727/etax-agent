/**
* taxcalc.ts — 税額計算の純粋関数群（本モジュールが数字の計算の正本）。
*
* 金額の計算は LLM に一切依存しない。ここにある関数は
* 決定的（同じ入力→同じ出力）で、テストで検証できる。
*
* 税率・控除額などの前提（2026年現在の個人事業主向け一般ルール）:
* - 消費税の標準税率は 10%（軽減税率 8% は扱わない。本ツールは
* サービス業・家賃収入を主対象とする）。
* - 税込経理を前提とする（売上・仕入は税込金額で入力する）。
* - 住宅の家賃は消費税非課税。本則課税の課税売上から除外する。
* - 簡易課税: サービス業は第5種事業、みなし仕入率 50%。
* - 2割特例: インボイス登録で課税事業者になった免税事業者等が対象。
* 納付税額 = 売上税額 × 20%。適用可否の判定は申告者側の前提条件とし、
* 本関数は計算のみを行う。
* - 青色申告特別控除: 65万円（e-Tax申告または電子帳簿保存が前提の
* 金額。紙申告等では 55万円、要件を満たさない青色申告者は 10万円）。
* 55万円・65万円控除は不動産所得と事業所得の合計額が限度であり、
* 控除は「不動産所得 → 事業所得」の順に順次行う（事業所得がある場合に
* 不動産分 10万円が別枠で上乗せされることはない）。不動産所得のみで
* 事業的規模でない場合は 10万円が限度。国税庁タックスアンサー
* No.2072「青色申告特別控除」に基づく。
* なお各所得区分の控除額は、その区分の所得金額（控除前）を上限とする
* （控除によってその区分が赤字になることはない）。
*/

import type { Transaction} from "./types";
import {
  agricultureIncomeBeforeBlueDeduction,
  computeAgricultureStatement,
  isAgricultureEmpty,
} from "./agriculture";
import type { AgricultureInput } from "./agriculture";

/** 消費税 標準税率 */
export const TAX_RATE = 0.1;

/** 青色申告特別控除の上限（65万円控除。不動産・事業の合算限度） */
export const BLUE_MAX_BUSINESS = 650_000;
/** 不動産所得のみで事業的規模でない場合の青色申告特別控除の上限 */
export const BLUE_MAX_REAL_ESTATE = 100_000;

/** 申告の種類（青色申告特別控除の区分）。白色申告は控除なし。 */
export type FilingType = "blue65" | "blue55" | "blue10" | "white";

/** 青色申告特別控除の計算条件。 */
export interface BlueDeductionOptions {
  /** 申告の種類（既定: blue65） */
  filingType?: FilingType;
  /** 不動産貸付けが事業的規模か（既定: false＝事業的規模でない） */
  realEstateBusinessScale?: boolean;
  /**
   * 事業（農業を含む）を営んでいるか。55万・65万円控除の要件は事業を営んで
   * いることで、事業所得が赤字でも満たす（No.2072）。未指定なら事業所得・
   * 農業所得が黒字かどうかで判定する。
   */
  operatesBusiness?: boolean;
}

/** 申告の種類ごとの控除上限（本体分）。 */
const BLUE_MAIN_CAPS: Record<FilingType, number> = {
  blue65: 650_000,
  blue55: 550_000,
  blue10: 100_000,
  white: 0,
};

export interface BlueDeductionCaps {
  /** 事業所得からの控除上限 */
  business: number;
  /** 不動産所得からの控除上限 */
  realEstate: number;
  /** 合計の上限 */
  total: number;
}

/**
 * 申告の種類と不動産の規模から、青色申告特別控除の上限を求める。
 * - 青色65万円・55万円控除は、不動産所得と事業所得の合計額が限度
 *   （国税庁タックスアンサー No.2072）。不動産が事業的規模かどうかで
 *   合算限度は変わらない。
 * - 青色10万円控除も合算した所得に対して 10万円が限度。
 * - 白色申告は控除なし。
 * 返り値の business / realEstate はいずれも合算限度（プール上限）と同額で、
 * 区分ごとの別枠上限ではない。
 */
export function blueDeductionCaps(options: BlueDeductionOptions = {}): BlueDeductionCaps {
  const filingType = options.filingType ?? "blue65";
  const main = BLUE_MAIN_CAPS[filingType];
  if (filingType === "white") return { business: 0, realEstate: 0, total: 0 };
  return { business: main, realEstate: main, total: main };
}

/** 簡易課税のみなし仕入率（事業区分ごと） */
export const SIMPLIFIED_RATES = {
wholesale: 0.9, // 第1種 卸売業
retail: 0.8, // 第2種 小売業
manufacturing: 0.7, // 第3種 製造業等
other: 0.6, // 第4種 その他
services: 0.5, // 第5種 サービス業等 ← 既定
real_estate: 0.4, // 第6種 不動産業
} as const;

export type BusinessKind = keyof typeof SIMPLIFIED_RATES;
export type ConsumptionMethod = "standard" | "simplified" | "special20";

/** 円未満を切り捨てる（消費税の端数処理に合わせる）。浮動小数の誤差吸収つき。 */
function floorYen(x: number): number {
return Math.floor(x + 1e-9);
}

/** 税込の課税売上から売上税額（預かった消費税）を求める。税率10%: 税額 = 税込 × 10/110。 */
export function outputTaxFromTaxInclusive(salesInclTax: number): number {
if (salesInclTax <= 0) return 0;
return floorYen((salesInclTax * 10) / 110);
}

// ---------------------------------------------------------------------------
// 家事按分（事業分金額の算出）
// ---------------------------------------------------------------------------

/**
 * 按分の端数処理方式（定数）。事業分は取引単位で、金額の絶対値に割合を
 * 掛けた余りを切り捨てる（端数は私用分に寄せる）。この方式により
 * 事業分＋私用分＝元の金額 が常に成り立つ。方式を変える場合は
 * この定数と businessPortionAmount の1か所だけを変更する。
 */
export const BUSINESS_PORTION_ROUNDING = "truncate" as const;

/** 事業割合（0〜100）に正規化する。未指定・不正値は 100（全額事業分）。 */
export function normalizeBusinessRatio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.trunc(value)));
}

/** 取引の事業割合（0〜100）。未指定は 100。 */
export function businessRatioOf(transaction: Transaction): number {
  return normalizeBusinessRatio(transaction.business_ratio_percent);
}

/**
 * 金額（符号つき）と事業割合から事業分金額を求める（符号つき）。
 * 端数処理は BUSINESS_PORTION_ROUNDING（取引単位・絶対値の切り捨て）。
 */
export function businessPortionAmount(amount: number, businessRatioPercent: number): number {
  const truncated = Math.trunc(amount || 0);
  const ratio = normalizeBusinessRatio(businessRatioPercent);
  if (ratio === 100) return truncated;
  if (ratio === 0 || truncated === 0) return 0;
  const magnitude = Math.floor((Math.abs(truncated) * ratio) / 100);
  if (magnitude === 0) return 0;
  return (truncated < 0 ? -1 : 1) * magnitude;
}

/**
 * 取引の事業分金額。必要経費の集計・月次集計・決算書・試算表など、
 * 金額を集計する経路はすべてこの関数経由に統一する（単一の決定的関数）。
 */
export function transactionBusinessAmount(transaction: Transaction): number {
  return businessPortionAmount(transaction.amount, businessRatioOf(transaction));
}

// ---------------------------------------------------------------------------
// 所得の集計（事業所得 / 不動産所得）
// ---------------------------------------------------------------------------

export interface IncomeBreakdown {
businessRevenue: number;
businessExpenses: number;
realEstateRevenue: number;
realEstateExpenses: number;
otherRevenue: number;
otherExpenses: number;
/** 事業所得（控除前）= 事業収入 − 事業経費 */
businessIncome: number;
/** 不動産所得（控除前）= 不動産収入 − 不動産経費 */
realEstateIncome: number;
}

/** 取引リストを income_type ごとに収入/経費へ振り分ける。 */
export function aggregateIncome(transactions: Transaction[]): IncomeBreakdown {
const b = {
businessRevenue: 0,
businessExpenses: 0,
realEstateRevenue: 0,
realEstateExpenses: 0,
otherRevenue: 0,
otherExpenses: 0,
};
for (const t of transactions) {
const amount = transactionBusinessAmount(t);
const itype = t.income_type || "other";
if (itype === "business") {
if (amount >= 0) b.businessRevenue += amount;
else b.businessExpenses += -amount;
} else if (itype === "real_estate") {
if (amount >= 0) b.realEstateRevenue += amount;
else b.realEstateExpenses += -amount;
} else {
if (amount >= 0) b.otherRevenue += amount;
else b.otherExpenses += -amount;
}
}
return {
...b,
businessIncome: b.businessRevenue - b.businessExpenses,
realEstateIncome: b.realEstateRevenue - b.realEstateExpenses,
};
}

// ---------------------------------------------------------------------------
// 青色申告特別控除
// ---------------------------------------------------------------------------

export interface BlueDeduction {
realEstate: number;
business: number;
/** 農業所得（事業所得の一部）への配分額 */
agriculture: number;
total: number;
}

/**
* 青色申告特別控除を「不動産 → 事業」の順で計算する。農業所得は
* 事業所得の一部であり、事業（営業等）の残りから配分する（配分順は
* 控除の総額に影響しない。各様式の所得金額行のための決定的な規約）。
* 国税庁タックスアンサー No.2072 の取扱い:
* - 55万円・65万円控除は不動産所得と事業所得の合計額が限度で、
*   不動産所得から先に控除し、残りを事業所得から控除する。
* - 不動産所得のみで事業的規模でない場合は 10万円が限度。
* - 10万円控除も合算した所得に対して 10万円が限度。
* 申告の種類（青色55万円・10万円・白色）や不動産の事業的規模は
* BlueDeductionOptions で切り替える（上限の組み立ては blueDeductionCaps）。
* 所得がマイナスの区分からは控除しない（控除で赤字は作らない）。
*/
export function blueDeduction(
realEstateIncome: number,
businessIncome: number,
options: BlueDeductionOptions = {},
agricultureIncome: number = 0,
): BlueDeduction {
const filingType = options.filingType ?? "blue65";
const rePos = Math.max(realEstateIncome, 0);
const bizPos = Math.max(businessIncome, 0);
const agrPos = Math.max(agricultureIncome, 0);
if (filingType === "white") {
return { realEstate: 0, business: 0, agriculture: 0, total: 0 };
}
const caps = blueDeductionCaps(options);
// 事業を営んでおらず、不動産貸付けが事業的規模でない場合は 10万円が限度。
// 農業所得は事業所得の一部なので、農業を営んでいれば事業を営んでいる側。
const operatesBusiness = options.operatesBusiness ?? bizPos + agrPos > 0;
const cap =
!operatesBusiness && !options.realEstateBusinessScale
? Math.min(caps.total, BLUE_MAX_REAL_ESTATE)
: caps.total;
const pool = Math.min(cap, rePos + bizPos + agrPos);
const realEstate = Math.min(rePos, pool);
const business = Math.min(bizPos, pool - realEstate);
const agriculture = pool - realEstate - business;
return { realEstate, business, agriculture, total: pool };
}

// ---------------------------------------------------------------------------
// 消費税
// ---------------------------------------------------------------------------

export interface ConsumptionTaxResult {
method: ConsumptionMethod;
/** 課税売上（税込） */
taxableSalesIncl: number;
/** 非課税売上（税込）— 住宅家賃など */
nontaxableSalesIncl: number;
/** 売上税額 */
outputTax: number;
/** 仕入税額（本則のみ実額、その他は参考値） */
inputTax: number;
/** 納付税額（マイナスは還付側） */
payable: number;
detail: Record<string, unknown>;
}

export interface ConsumptionTaxOptions {
taxableSalesIncl: number;
nontaxableSalesIncl?: number;
inputTax?: number;
method?: ConsumptionMethod;
businessKind?: BusinessKind;
}

/**
 * 課税売上割合（%、小数第2位未満切捨て）。分母は課税売上（税抜）＋非課税売上。
 * 売上が無いときは 100 とする（按分しない）。
 */
export function taxableSalesRatioPercent(taxableSalesIncl: number, nontaxableSales: number): number {
  const taxableExcl = Math.floor((Math.max(Math.trunc(taxableSalesIncl), 0) * 100) / 110);
  const total = taxableExcl + Math.max(Math.trunc(nontaxableSales), 0);
  if (total <= 0) return 100;
  return Math.floor((taxableExcl * 10000) / total) / 100;
}

/**
* 消費税の納付税額を計算する（税込経理・税率10%前提）。
* - standard （本則）: 売上税額 - 仕入税額。
* 課税売上には非課税の住宅家賃を含めないこと（呼び出し側の
* 責任。taxableSalesFromBreakdown がそれを担う）。課税売上割合が
* 95%未満のときは、仕入税額に課税売上割合を掛ける（一括比例配分方式）。
* - simplified（簡易課税）: 売上税額 × (1 - みなし仕入率)。
* 既定はサービス業（第5種・50%）。
* - special20 （2割特例）: 売上税額 × 20%。
*/
export function consumptionTax(opts: ConsumptionTaxOptions): ConsumptionTaxResult {
const {
taxableSalesIncl,
nontaxableSalesIncl = 0,
inputTax = 0,
method = "standard",
businessKind = "services",
} = opts;

const output = outputTaxFromTaxInclusive(taxableSalesIncl);

let payable: number;
let detail: Record<string, unknown>;
let usedInput: number;

if (method === "standard") {
const ratio = taxableSalesRatioPercent(taxableSalesIncl, nontaxableSalesIncl);
const rawInput = Math.trunc(inputTax);
usedInput = ratio >= 95 ? rawInput : Math.floor((rawInput * ratio) / 100);
payable = output - usedInput;
detail = { formula: "output_tax - input_tax", taxable_sales_ratio_percent: ratio };
} else if (method === "simplified") {
const rate = SIMPLIFIED_RATES[businessKind];
payable = floorYen(output * (1 - rate));
detail = {
formula: "output_tax * (1 - deemed_purchase_rate)",
deemed_purchase_rate: rate,
business_kind: businessKind,
};
usedInput = output - payable; // 参考値（みなし仕入税額）
} else if (method === "special20") {
payable = floorYen(output * 0.2);
detail = { formula: "output_tax * 20% (2割特例)"};
usedInput = output - payable; // 参考値
} else {
throw new Error(
`未知の計算方式です: ${JSON.stringify(method)} (standard / simplified / special20)`,
);
}

return {
method,
taxableSalesIncl: Math.trunc(taxableSalesIncl),
nontaxableSalesIncl: Math.trunc(nontaxableSalesIncl),
outputTax: output,
inputTax: usedInput,
payable,
detail,
};
}

/** 非課税売上の勘定科目（住宅家賃）。事業用賃貸（事務所家賃等）は課税なので含めない。 */
export const RESIDENTIAL_RENT_CATEGORIES: ReadonlySet<string> = new Set(["家賃収入"]);

/**
* (課税売上(税込), 非課税売上(税込)) を所得内訳から求める。
*
* IncomeBreakdown 単体では家賃額が分からないため、家賃収入額が
* 分かっている場合は rentAmount で渡す。渡されない場合は
* 「不動産収入はすべて住宅家賃＝非課税」とみなす
* （本ツールの主用途：賃貸物件の家賃収入）。
*/
export function taxableSalesFromBreakdown(
breakdown: IncomeBreakdown,
rentAmount?: number,
): [taxable: number, nontaxable: number] {
const rent = rentAmount?? breakdown.realEstateRevenue;
const taxable = breakdown.businessRevenue + (breakdown.realEstateRevenue - rent);
return [taxable, rent];
}

/**
* 仕入税額の簡易推定で「課税仕入にならない」とする科目。
* （租税公課・保険料・給与・減価償却費などは消費税の課税仕入ではない）
* 青色申告特別控除は経費ではなく所得控除だが、取引の category に
* 紛れ込んだ場合に課税仕入として数えないよう除外対象に含めている。
*/
export const NON_TAXABLE_EXPENSE_CATEGORIES: ReadonlySet<string> = new Set([
  // 科目名は台帳の分類カテゴリ（ledger.ts の ACCOUNT_CRITERIA）と一致させる。
  // 旧表記（保険料・給与賃金）は実カテゴリ名とずれており、損害保険料・
  // 給料賃金が課税仕入として誤判定されていた。
  "租税公課",
  "損害保険料",
  "給料賃金",
  "利子割引料",
  "貸倒金",
  "減価償却費",
  "青色申告特別控除",
]);

/**
* 経費取引から仕入税額を概算する（税込経費 × 10/110、課税仕入のみ）。
* 対象は事業・不動産の取引だけで、資金移動・私用（収入区分 other）は数えない。
* 課税売上割合による按分前の額。
* あくまで概算。本則課税の正式な仕入税額は請求書等で確定させること。
*/
export function estimateInputTax(transactions: Transaction[]): number {
let total = 0;
for (const t of transactions) {
if (t.income_type !== "business" && t.income_type !== "real_estate") continue;
// 課税仕入れの母数は事業分のみ（家事按分後の金額。消基通11-1-5）。
const amount = transactionBusinessAmount(t);
if (amount >= 0) continue;
if (NON_TAXABLE_EXPENSE_CATEGORIES.has(t.category || "")) continue;
total += -amount;
}
return outputTaxFromTaxInclusive(total);
}

// ---------------------------------------------------------------------------
// 修正後の申告数値の計算（パイプライン）
// ---------------------------------------------------------------------------

/** 修正後の申告数値の内訳（控除前後の所得・控除の振り分け）。 */
export interface CorrectedFiguresDetail {
  business_income_before_deduction: number;
  real_estate_income_before_deduction: number;
  blue_deduction_real_estate: number;
  blue_deduction_business: number;
  /** 事業所得（控除後） */
  business_income: number;
  /** 不動産所得（控除後） */
  real_estate_income: number;
  /** 農業所得（青色申告特別控除前。白色は専従者控除後） */
  agriculture_income_before_deduction: number;
  /** 青色申告特別控除の農業所得への配分額 */
  blue_deduction_agriculture: number;
  /** 農業所得（控除後） */
  agriculture_income: number;
}

/**
 * 修正後の申告数値。申告JSON（original/corrected）と同形式のフラットな
 * 数値フィールド（snake_case）を持ち、そのまま amendmentDelta の
 * corrected 側に渡せる。"_detail" は内訳で、"_" 始まりのため
 * amendmentDelta の差分対象にはならない。
 */
export interface CorrectedFigures {
  [key: string]: unknown;
  year: number;
  business_revenue: number;
  business_expenses: number;
  real_estate_revenue: number;
  real_estate_expenses: number;
  /** 農業の収入金額の計（決算書の棚卸調整込み。農業入力が無い場合は0） */
  agriculture_revenue: number;
  /** 農業の経費計（育成費用の調整込み。専従者給与・控除は含まない） */
  agriculture_expenses: number;
  /** 青色申告特別控除の合計 */
  blue_deduction: number;
  /** 課税売上（税込）。家賃は非課税側 */
  taxable_sales: number;
  /** 非課税売上（税込） */
  nontaxable_sales: number;
  /** 仕入税額の概算（本則の基礎） */
  input_tax_estimate: number;
  consumption_tax_standard: number;
  consumption_tax_simplified: number;
  consumption_tax_special20: number;
  _detail: CorrectedFiguresDetail;
}

/**
 * 対象年の取引リストから「修正後の申告数値」を計算して返す。
 *
 * パイプライン: 所得の切り分け（aggregateIncome）
 *   → 青色申告特別控除（blueDeduction、不動産→事業の順）
 *   → 消費税3方式の比較（consumptionTax × standard/simplified/special20）。
 *
 * 所得税額そのもの（income_tax）や住宅借入金等特別控除の額は取引データからは
 * 計算できないため含めない（呼び出し側で申告済み値を引き継ぐ等で扱う）。
 * transactions は対象年の分だけを渡すこと（filterYear 済み前提）。
 */
/** computeCorrectedFigures の計算条件（青色控除の条件＋農業所得の入力）。 */
export interface ComputeCorrectedFiguresOptions extends BlueDeductionOptions {
  /**
   * 農業所得の入力（申告入力として別に保持するもの。帳簿の取引とは
   * 混ぜない）。未指定または全て空の場合は農業なしとして計算する。
   */
  agriculture?: AgricultureInput;
}

export function computeCorrectedFigures(
  transactions: Transaction[],
  year = 0,
  options: ComputeCorrectedFiguresOptions = {},
): CorrectedFigures {
  const b = aggregateIncome(transactions);
  // 農業所得は帳簿の集計とは独立に、申告入力から決算書計算する。
  const agricultureStatement =
    options.agriculture && !isAgricultureEmpty(options.agriculture)
      ? computeAgricultureStatement(options.agriculture)
      : undefined;
  const agricultureBeforeDeduction = agricultureStatement
    ? agricultureIncomeBeforeBlueDeduction(
        agricultureStatement,
        (options.filingType ?? "blue65") === "white",
      )
    : 0;
  const blue = blueDeduction(
    b.realEstateIncome,
    b.businessIncome,
    {
      ...options,
      operatesBusiness:
        options.operatesBusiness ??
        (agricultureStatement !== undefined || transactions.some((t) => t.income_type === "business")),
    },
    agricultureBeforeDeduction,
  );

  // 住宅家賃（非課税）の合計。ledger.residentialRentTotal と同条件だが、
  // taxcalc の独立性（ledger に依存しない）を保つためここで数える。
  let rent = 0;
  for (const t of transactions) {
    const amount = transactionBusinessAmount(t);
    if (
      (t.income_type || "") === "real_estate" &&
      RESIDENTIAL_RENT_CATEGORIES.has(t.category || "") &&
      amount > 0
    ) {
      rent += amount;
    }
  }
  const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
  const inputTax = estimateInputTax(transactions);
  const methods = ["standard", "simplified", "special20"] as const;
  const payables = methods.map(
    (m) =>
      consumptionTax({
        taxableSalesIncl: taxable,
        nontaxableSalesIncl: nontaxable,
        inputTax,
        method: m,
      }).payable,
  );

  return {
    year: Math.trunc(year),
    business_revenue: b.businessRevenue,
    business_expenses: b.businessExpenses,
    real_estate_revenue: b.realEstateRevenue,
    real_estate_expenses: b.realEstateExpenses,
    agriculture_revenue: agricultureStatement?.revenueTotal ?? 0,
    agriculture_expenses: agricultureStatement?.expensesTotal ?? 0,
    blue_deduction: blue.total,
    taxable_sales: taxable,
    nontaxable_sales: nontaxable,
    input_tax_estimate: inputTax,
    consumption_tax_standard: payables[0] as number,
    consumption_tax_simplified: payables[1] as number,
    consumption_tax_special20: payables[2] as number,
    _detail: {
      business_income_before_deduction: b.businessIncome,
      real_estate_income_before_deduction: b.realEstateIncome,
      blue_deduction_real_estate: blue.realEstate,
      blue_deduction_business: blue.business,
      business_income: b.businessIncome - blue.business,
      real_estate_income: b.realEstateIncome - blue.realEstate,
      agriculture_income_before_deduction: agricultureBeforeDeduction,
      blue_deduction_agriculture: blue.agriculture,
      agriculture_income: agricultureBeforeDeduction - blue.agriculture,
    },
  };
}

// ---------------------------------------------------------------------------
// 修正申告の差分
// ---------------------------------------------------------------------------

export interface FieldDiff {
original: unknown;
corrected: unknown;
/** 数値差分。数値でない場合は null */
diff: number | null;
}

export interface AmendmentDelta {
year: number;
fieldDiffs: Record<string, FieldDiff>;
/** 税額フィールドの差分。無ければ null */
taxDelta: number | null;
}

/** 税額とみなすフィールド名（差分を「税額の増減」として拾う） */
const TAX_FIELDS = ["income_tax_payable", "income_tax", "tax_payable", "tax"] as const;

function isNum(v: unknown): v is number {
return typeof v === "number" && Number.isFinite(v);
}

/**
* 申告済み（original）と修正後（corrected）の JSON を突き合わせ、
* フィールドごとの差分と税額の増減を返す。
*
* 数値でないフィールドは差分対象外（ただし両者にあり値が違う場合は
* そのまま記録する）。片方にしか無い数値フィールドは 0 との差分にする。
* "_" で始まるキー（注記）は差分対象外。
*/
export function amendmentDelta(
original: Record<string, unknown>,
corrected: Record<string, unknown>,
year = 0,
): AmendmentDelta {
const diffs: Record<string, FieldDiff> = {};
const keys = [...new Set([...Object.keys(original),...Object.keys(corrected)])].sort();
for (const k of keys) {
if (k.startsWith("_")) continue; // "_comment" のような注記キーは差分対象外
const ov = original[k];
const cv = corrected[k];
if (isNum(ov) || isNum(cv)) {
const oNum = isNum(ov)? ov: 0;
const cNum = isNum(cv)? cv: 0;
if (oNum!== cNum) {
diffs[k] = { original: oNum, corrected: cNum, diff: cNum - oNum};
}
} else if (ov!== cv) {
diffs[k] = { original: ov?? null, corrected: cv?? null, diff: null};
}
}

let taxDelta: number | null = null;
for (const f of TAX_FIELDS) {
const d = diffs[f];
if (d && d.diff!== null) {
taxDelta = d.diff;
break;
}
}

const origYear = isNum(original["year"])? (original["year"] as number): 0;
const corrYear = isNum(corrected["year"])? (corrected["year"] as number): 0;
return {
year: year || origYear || corrYear,
fieldDiffs: diffs,
taxDelta,
};
}
