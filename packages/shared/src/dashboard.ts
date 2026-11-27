/**
 * dashboard.ts — ダッシュボードに出す数値。対象年の所得の内訳・青色申告特別
 * 控除・消費税3方式の比較、勘定科目ごとの内訳（円グラフ）、年ごとの推移。
 * Web と native のダッシュボードが共有する。
 *
 * 集計範囲は確定申告画面と同じ事業＋不動産。資金の移動（その他区分）は
 * 収支ではないので内訳・推移に混ぜない。
 */
import { isAgricultureEmpty } from "./agriculture";
import { filterYear } from "./ledger";
import {
  aggregateIncome,
  BlueDeduction,
  blueDeduction,
  compareConsumptionMethods,
  ComputeCorrectedFiguresOptions,
  computeCorrectedFigures,
  ConsumptionMethod,
  ConsumptionTaxResult,
  IncomeBreakdown,
  transactionBusinessAmount,
} from "./taxcalc";
import { Transaction } from "./types";

/** 消費税の方式ごとの比較の1行。売上税額・仕入税額は国税分。 */
export interface ConsumptionComparisonRow {
  method: ConsumptionMethod;
  /** 売上税額（国税分） */
  outputTax: number;
  /** 控除する仕入税額（国税分。簡易課税・特例はみなしの額） */
  inputTax: number;
  /** 差引税額（国税。マイナスは還付） */
  nationalPayable: number;
  /** 譲渡割額（地方消費税。マイナスは還付） */
  localPayable: number;
  /** 納付税額（国税＋地方消費税。マイナスは還付） */
  payable: number;
}

export interface DashboardFigures {
  breakdown: IncomeBreakdown;
  blue: BlueDeduction;
  /** 青色申告特別控除の限度額（不動産・事業・農業を合わせた所得に対する額。白色は 0） */
  blueDeductionLimit: number;
  /** 課税売上（税込） */
  taxableSalesIncl: number;
  /** 非課税売上（税込。住宅家賃） */
  nontaxableSalesIncl: number;
  /** 仕入税額の概算（国税分。課税売上割合で按分する前の額） */
  inputTaxEstimate: number;
  /** 小規模事業者の特例の率（2割特例 0.2・3割特例 0.3）。特例の無い年分は null */
  smallBusinessSpecialRate: number | null;
  /** 本則課税・簡易課税・小規模事業者の特例の順。特例の無い年分は特例の行を持たない */
  consumption: ConsumptionComparisonRow[];
}

/**
 * 対象年の取引（割り当て年度で絞ったもの）から、ダッシュボードの数値一式を求める。
 * 青色申告特別控除と消費税は確定申告画面と同じ computeCorrectedFigures から取る
 * （申告入力の農業所得も控除の配分に入り、消費税は年分の特例の率・課税売上割合の
 * 按分で計算する）。消費税の方式ごとの内訳は compareConsumptionMethods の結果を使う。
 */
export function dashboardFigures(
  yearTransactions: Transaction[],
  year: number,
  options: ComputeCorrectedFiguresOptions,
): DashboardFigures {
  const breakdown = aggregateIncome(yearTransactions);
  const corrected = computeCorrectedFigures(yearTransactions, year, options);
  const blue: BlueDeduction = {
    realEstate: corrected._detail.blue_deduction_real_estate,
    business: corrected._detail.blue_deduction_business,
    agriculture: corrected._detail.blue_deduction_agriculture,
    total: corrected.blue_deduction,
  };
  const comparison = compareConsumptionMethods(yearTransactions, year, options.businessKind);
  const methodResults: readonly [ConsumptionMethod, ConsumptionTaxResult | null][] = [
    ["standard", comparison.standard],
    ["simplified", comparison.simplified],
    ["special20", comparison.special],
  ];
  const consumption = methodResults.flatMap(([method, result]) =>
    result === null
      ? []
      : [
          {
            method,
            outputTax: result.outputTax,
            inputTax: result.inputTax,
            nationalPayable: result.nationalPayable,
            localPayable: result.localPayable,
            payable: result.payable,
          },
        ],
  );
  return {
    breakdown,
    blue,
    blueDeductionLimit: blueDeductionLimit(yearTransactions, options),
    taxableSalesIncl: comparison.taxableSalesIncl,
    nontaxableSalesIncl: comparison.nontaxableSalesIncl,
    inputTaxEstimate: comparison.inputTaxEstimate,
    smallBusinessSpecialRate: comparison.smallBusinessSpecialRate,
    consumption,
  };
}

/** 小規模事業者の特例の名前（率 0.2 は「2割特例」、0.3 は「3割特例」）。 */
export function smallBusinessSpecialLabel(rate: number): string {
  return `${Math.round(rate * 10)}割特例`;
}

/**
 * 青色申告特別控除の限度額。事業（農業を含む）を営んでいるかの判定は
 * computeCorrectedFigures と同じ（事業の取引か農業所得の入力があれば営んでいる）。
 * 所得の制約を外したとき（不動産所得が十分に大きいとき）の控除額が限度額になるので、
 * 規則は blueDeduction のものをそのまま使う。
 */
function blueDeductionLimit(
  yearTransactions: Transaction[],
  options: ComputeCorrectedFiguresOptions,
): number {
  const operatesBusiness =
    options.operatesBusiness ??
    ((options.agriculture !== undefined && !isAgricultureEmpty(options.agriculture)) ||
      yearTransactions.some((t) => t.income_type === "business"));
  return blueDeduction(Number.MAX_SAFE_INTEGER, 0, { ...options, operatesBusiness }).total;
}

// ---------------------------------------------------------------------------
// 勘定科目ごとの内訳（円グラフ）
// ---------------------------------------------------------------------------

export interface CategoryAmount {
  category: string;
  amount: number;
}

/** 円グラフに出すスライスの上限。超えた分は「その他」にまとめる。 */
const BREAKDOWN_MAX_SLICES = 6;

/**
 * 主要科目の固定色（パレットの番号）。収入・支出の両方で同じ科目は同じ色にする。
 * 「その他」は灰色なのでここには含めない。
 */
const CATEGORY_COLOR_INDEX: Readonly<Record<string, number>> = {
  売上高: 0,
  家賃収入: 1,
  雑費: 2,
  消耗品費: 3,
  旅費交通費: 4,
  通信費: 5,
};

export interface BreakdownSlice extends CategoryAmount {
  /** 一覧の key */
  key: string;
  /** 合計に占める割合（%） */
  share: number;
  /** 円グラフ上の開始位置（%） */
  start: number;
  /** パレットの番号。null は灰色（その他） */
  colorIndex: number | null;
}

export interface CategoryBreakdown {
  /** 科目ごとの合計（金額の大きい順） */
  rows: CategoryAmount[];
  total: number;
  slices: BreakdownSlice[];
}

/**
 * 収入（事業分がプラス）または支出（事業分がマイナス。絶対値で積む）の取引を
 * 勘定科目ごとに合計し、円グラフのスライスにする。金額は事業分（家事按分後）。
 */
export function categoryBreakdown(
  yearTransactions: Transaction[],
  direction: "income" | "expense",
): CategoryBreakdown {
  const totals = new Map<string, number>();
  for (const t of yearTransactions) {
    if (t.income_type === "other") continue;
    const amount = transactionBusinessAmount(t);
    if (direction === "income" ? amount <= 0 : amount >= 0) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(amount));
  }
  const rows = [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return { rows, total, slices: toSlices(rows, total) };
}

function toSlices(rows: readonly CategoryAmount[], total: number): BreakdownSlice[] {
  const grouped = groupSlices(rows);
  const colorIndexes = assignColorIndexes(grouped);
  let accumulated = 0;
  return grouped.map((slice, index) => {
    const share = total > 0 ? (slice.amount / total) * 100 : 0;
    const start = accumulated;
    accumulated += share;
    return { ...slice, key: slice.category, share, start, colorIndex: colorIndexes[index] ?? null };
  });
}

/** 上限を超えた科目のまとめ。勘定科目の「その他」（受け皿の科目）もここに入れる。 */
const REST_CATEGORY = "その他";

// スライス上限を超えた科目は「その他」に合算する。勘定科目の「その他」を
// 別のスライスに残すと、同じ名前のスライスが2つになるため一緒にまとめる。
function groupSlices(rows: readonly CategoryAmount[]): CategoryAmount[] {
  if (rows.length <= BREAKDOWN_MAX_SLICES) return [...rows];
  const head = rows
    .filter((row) => row.category !== REST_CATEGORY)
    .slice(0, BREAKDOWN_MAX_SLICES - 1);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const headTotal = head.reduce((sum, row) => sum + row.amount, 0);
  return [...head, { category: REST_CATEGORY, amount: total - headTotal }];
}

// 固定色のある科目はその色、無い科目は空いている色を順に使う。「その他」は灰色。
function assignColorIndexes(slices: readonly CategoryAmount[]): (number | null)[] {
  const used = new Set<number>();
  const assigned = slices.map((slice): number | null | undefined => {
    if (slice.category === REST_CATEGORY) return null;
    const fixed = CATEGORY_COLOR_INDEX[slice.category];
    if (fixed !== undefined && !used.has(fixed)) {
      used.add(fixed);
      return fixed;
    }
    return undefined;
  });
  let next = 0;
  return assigned.map((index) => {
    if (index !== undefined) return index;
    while (used.has(next)) next += 1;
    used.add(next);
    return next;
  });
}

// ---------------------------------------------------------------------------
// 年ごとの推移
// ---------------------------------------------------------------------------

export interface YearlyIncomeTotals {
  year: number;
  /** 事業＋不動産の収入 */
  revenue: number;
  /** 事業＋不動産の経費 */
  expenses: number;
  balance: number;
}

/** 取引のある割り当て年度ごとの収入・経費・差引（古い年から順）。 */
export function yearlyIncomeTotals(transactions: Transaction[]): YearlyIncomeTotals[] {
  const years = [...new Set(transactions.map((t) => t.year))].sort((a, b) => a - b);
  return years.map((year) => {
    const breakdown = aggregateIncome(filterYear(transactions, year));
    const revenue = breakdown.businessRevenue + breakdown.realEstateRevenue;
    const expenses = breakdown.businessExpenses + breakdown.realEstateExpenses;
    return { year, revenue, expenses, balance: revenue - expenses };
  });
}
