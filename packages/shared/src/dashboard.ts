/**
 * dashboard.ts — ダッシュボードに出す数値。対象年の所得の内訳・青色申告特別
 * 控除・消費税3方式の比較、勘定科目ごとの内訳（円グラフ）、年ごとの推移。
 * Web と native のダッシュボードが共有する。
 *
 * 集計範囲は確定申告画面と同じ事業＋不動産。資金の移動（その他区分）は
 * 収支ではないので内訳・推移に混ぜない。
 */
import { filterYear } from "./ledger";
import {
  aggregateIncome,
  BlueDeduction,
  BlueDeductionOptions,
  blueDeduction,
  ConsumptionMethod,
  consumptionTax,
  estimateInputTax,
  IncomeBreakdown,
  residentialRentTotal,
  taxableSalesFromBreakdown,
  transactionBusinessAmount,
} from "./taxcalc";
import { Transaction } from "./types";

/** 消費税の方式ごとの比較の1行。 */
export interface ConsumptionComparisonRow {
  method: ConsumptionMethod;
  outputTax: number;
  inputTax: number;
  payable: number;
}

export interface DashboardFigures {
  breakdown: IncomeBreakdown;
  blue: BlueDeduction;
  /** 課税売上（税込） */
  taxableSalesIncl: number;
  /** 非課税売上（税込。住宅家賃） */
  nontaxableSalesIncl: number;
  /** 仕入税額の概算 */
  inputTaxEstimate: number;
  /** 本則課税・簡易課税・2割特例の順 */
  consumption: ConsumptionComparisonRow[];
}

const CONSUMPTION_METHOD_ORDER: readonly ConsumptionMethod[] = ["standard", "simplified", "special20"];

/** 対象年の取引（割り当て年度で絞ったもの）から、ダッシュボードの数値一式を求める。 */
export function dashboardFigures(
  yearTransactions: Transaction[],
  options: BlueDeductionOptions,
): DashboardFigures {
  const breakdown = aggregateIncome(yearTransactions);
  const blue = blueDeduction(breakdown.realEstateIncome, breakdown.businessIncome, options);
  const rent = residentialRentTotal(yearTransactions);
  const [taxableSalesIncl, nontaxableSalesIncl] = taxableSalesFromBreakdown(breakdown, rent);
  const inputTaxEstimate = estimateInputTax(yearTransactions);
  const consumption = CONSUMPTION_METHOD_ORDER.map((method) => {
    const result = consumptionTax({
      taxableSalesIncl,
      nontaxableSalesIncl,
      inputTax: inputTaxEstimate,
      method,
    });
    return {
      method,
      outputTax: result.outputTax,
      inputTax: result.inputTax,
      payable: result.payable,
    };
  });
  return { breakdown, blue, taxableSalesIncl, nontaxableSalesIncl, inputTaxEstimate, consumption };
}

// ---------------------------------------------------------------------------
// 勘定科目ごとの内訳（円グラフ）
// ---------------------------------------------------------------------------

export interface CategoryAmount {
  category: string;
  amount: number;
}

/** 円グラフに出すスライスの上限。超えた分は「その他」にまとめる。 */
export const BREAKDOWN_MAX_SLICES = 6;

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

// スライス上限を超えた科目は「その他」に合算する。
function groupSlices(rows: readonly CategoryAmount[]): CategoryAmount[] {
  if (rows.length <= BREAKDOWN_MAX_SLICES) return [...rows];
  const head = rows.slice(0, BREAKDOWN_MAX_SLICES - 1);
  const rest = rows.slice(BREAKDOWN_MAX_SLICES - 1);
  const restTotal = rest.reduce((sum, row) => sum + row.amount, 0);
  return [...head, { category: "その他", amount: restTotal }];
}

// 固定色のある科目はその色、無い科目は空いている色を順に使う。「その他」は灰色。
function assignColorIndexes(slices: readonly CategoryAmount[]): (number | null)[] {
  const used = new Set<number>();
  const assigned = slices.map((slice): number | null | undefined => {
    if (slice.category === "その他") return null;
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
