/**
* taxcalc.ts — 税額計算の純粋関数群（本モジュールが数字の計算の正本。
* 旧 Python 版 ~/workspace/kakutei-agent/taxcalc.py は参照用レガシー）。
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
* - 青色申告特別控除: 事業所得は最大 65万円（e-Tax申告または
* 電子帳簿保存が前提の金額。紙申告等では 55万円になる点に注意）、
* 不動産所得は事業的規模でない場合 最大 10万円。
* 控除は「不動産所得 → 事業所得」の順に適用され、両方ある場合は
* 合計で最大 75万円（10万 + 65万）まで認められる、という国税庁の
* 取扱い（タックスアンサー No.2075 等）を前提に計算する。
* なお各所得区分の控除額は、その区分の所得金額（控除前）を上限とする
* （控除によってその区分が赤字になることはない）。
*/

import type { Transaction} from "./types";

/** 消費税 標準税率 */
export const TAX_RATE = 0.1;

/** 青色申告特別控除（事業所得） */
export const BLUE_MAX_BUSINESS = 650_000;
/** 青色申告特別控除（不動産・非事業的規模） */
export const BLUE_MAX_REAL_ESTATE = 100_000;

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
const amount = Math.trunc(t.amount || 0);
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
total: number;
}

/**
* 青色申告特別控除を「不動産 → 事業」の順で計算する。
* - 不動産所得（事業的規模でない前提）: 所得の範囲内で最大 100,000円
* - 事業所得: 所得の範囲内で最大 650,000円
* - 両方ある場合の合計上限は 750,000円（100,000 + 650,000）
* 所得がマイナスの区分からは控除しない（控除で赤字は作らない）。
*/
export function blueDeduction(
realEstateIncome: number,
businessIncome: number,
): BlueDeduction {
const reDed = Math.min(Math.max(realEstateIncome, 0), BLUE_MAX_REAL_ESTATE);
let bizDed = Math.min(Math.max(businessIncome, 0), BLUE_MAX_BUSINESS);
// 合計上限（=750,000）の明示チェック。通常は各上限の合計がそのまま
// 合計上限になるため素通りするが、将来上限が変わっても破綻しない
// よう防御的に置く（Python 版と同一）。
const totalCap = BLUE_MAX_REAL_ESTATE + BLUE_MAX_BUSINESS;
if (reDed + bizDed > totalCap) {
bizDed = totalCap - reDed;
}
return { realEstate: reDed, business: bizDed, total: reDed + bizDed};
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
* 消費税の納付税額を計算する（税込経理・税率10%前提）。
* - standard （本則）: 売上税額 - 仕入税額。
* 課税売上には非課税の住宅家賃を含めないこと（呼び出し側の
* 責任。taxableSalesFromBreakdown がそれを担う）。
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
payable = output - Math.trunc(inputTax);
detail = { formula: "output_tax - input_tax"};
usedInput = Math.trunc(inputTax);
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
"租税公課",
"保険料",
"給与賃金",
"減価償却費",
"青色申告特別控除",
]);

/**
* 経費取引から仕入税額を概算する（税込経費 × 10/110、課税仕入のみ）。
* あくまで概算。本則課税の正式な仕入税額は請求書等で確定させること。
*/
export function estimateInputTax(transactions: Transaction[]): number {
let total = 0;
for (const t of transactions) {
const amount = Math.trunc(t.amount || 0);
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
export function computeCorrectedFigures(
  transactions: Transaction[],
  year = 0,
): CorrectedFigures {
  const b = aggregateIncome(transactions);
  const blue = blueDeduction(b.realEstateIncome, b.businessIncome);

  // 住宅家賃（非課税）の合計。ledger.residentialRentTotal と同条件だが、
  // taxcalc の独立性（ledger に依存しない）を保つためここで数える。
  let rent = 0;
  for (const t of transactions) {
    const amount = Math.trunc(t.amount || 0);
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
* "_" で始まるキー（注記）は差分対象外（Python 版と同一）。
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
