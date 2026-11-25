import {
  DepreciationYear,
  FixedAssetInput as EngineAssetInput,
  depreciationSchedule,
} from "@etax/shared";
import { DepreciationMethod, FixedAssetInput, FixedAssetRecord } from "@types";

/**
 * fixedAssetOptions.ts — 固定資産画面の選択肢・表示名・変換ヘルパー。
 * 償却の計算はサーバーと同じ共有エンジン（@etax/shared）で行う。
 */

export const METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: "定額法",
  declining_balance: "定率法",
  lump_sum: "一括償却",
  small_special: "少額特例",
};

export const METHOD_OPTIONS: readonly { value: DepreciationMethod; label: string }[] = [
  { value: "straight_line", label: "定額法" },
  { value: "declining_balance", label: "定率法（200%）" },
  { value: "lump_sum", label: "一括償却（3年均等）" },
  { value: "small_special", label: "少額減価償却資産の特例" },
];

export const INCOME_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "business", label: "事業" },
  { value: "real_estate", label: "不動産" },
  { value: "agriculture", label: "農業" },
];

export const INCOME_TYPE_LABELS: Record<string, string> = {
  business: "事業",
  real_estate: "不動産",
  agriculture: "農業",
};

/** 耐用年数の候補セレクトに出す、よく使う年数。候補に無い年数は数値入力で直接指定する。 */
export const USEFUL_LIFE_PRESETS: readonly number[] = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 47];

export const toInput = (row: FixedAssetRecord): FixedAssetInput => ({
  name: row.name,
  quantity: row.quantity,
  income_type: row.income_type,
  acquisition_date: row.acquisition_date,
  service_start_date: row.service_start_date,
  cost: row.cost,
  useful_life_years: row.useful_life_years,
  method: row.method,
  business_ratio_percent: row.business_ratio_percent,
  disposed_date: row.disposed_date,
});

export const emptyDraft = (year: number): FixedAssetInput => ({
  name: "",
  quantity: "",
  income_type: "business",
  acquisition_date: `${year}-01-01`,
  service_start_date: null,
  cost: 0,
  useful_life_years: 5,
  method: "straight_line",
  business_ratio_percent: 100,
  disposed_date: null,
});

/** レコードを共有エンジンの入力形式へ変換する。 */
export const toEngineInput = (asset: FixedAssetRecord): EngineAssetInput => ({
  acquisitionDate: asset.acquisition_date,
  serviceStartDate: asset.service_start_date ?? undefined,
  cost: asset.cost,
  usefulLifeYears: asset.useful_life_years,
  method: asset.method,
  businessRatioPercent: asset.business_ratio_percent,
});

/** 全期間の償却スケジュール（供用開始年から残高が尽きる年まで）。 */
export function fullSchedule(asset: FixedAssetRecord): DepreciationYear[] {
  const startYear = Number((asset.service_start_date ?? asset.acquisition_date).slice(0, 4));
  if (!Number.isFinite(startYear)) return [];
  // 耐用年数が長い資産でも上限を設ける（定率法の残高は必ず尽きる）。
  const lastYear = startYear + Math.max(asset.useful_life_years * 2, 10) + 5;
  try {
    return depreciationSchedule(toEngineInput(asset), lastYear);
  } catch {
    return [];
  }
}

/** 除却した年。除却していなければ null。 */
export function disposedYearOf(asset: FixedAssetRecord): number | null {
  if (!asset.disposed_date) return null;
  const year = Number(asset.disposed_date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/** 指定年度末の未償却残高。除却後は除却年の残高で止まる。 */
export function bookValueAt(asset: FixedAssetRecord, year: number): number {
  const disposedYear = disposedYearOf(asset);
  const effectiveYear = disposedYear !== null ? Math.min(year, disposedYear) : year;
  const schedule = fullSchedule(asset);
  let bookValue = asset.cost;
  for (const row of schedule) {
    if (row.year > effectiveYear) break;
    bookValue = row.closingBookValue;
  }
  return bookValue;
}

/** 指定年度の必要経費算入額（その年に償却が無ければ 0、除却の翌年以降も 0）。 */
export function deductibleAt(asset: FixedAssetRecord, year: number): number {
  const disposedYear = disposedYearOf(asset);
  if (disposedYear !== null && year > disposedYear) return 0;
  const row = fullSchedule(asset).find((entry) => entry.year === year);
  return row?.deductible ?? 0;
}

/**
 * 指定年度の台帳の対象か。その年度の償却スケジュールに現れる資産を対象とし、
 * 除却年がその年度より前の資産は対象外（除却した年度までは対象）。
 */
export function isAssetInYear(asset: FixedAssetRecord, year: number): boolean {
  const disposedYear = disposedYearOf(asset);
  if (disposedYear !== null && disposedYear < year) return false;
  return fullSchedule(asset).some((row) => row.year === year);
}

/** 償却の進み具合（0〜1）。少額特例は取得年に全額償却される。 */
export function depreciationProgress(asset: FixedAssetRecord, year: number): number {
  if (asset.cost <= 0) return 0;
  const remaining = bookValueAt(asset, year);
  return Math.min(1, Math.max(0, (asset.cost - remaining) / asset.cost));
}

/** フォームの検証。問題があればメッセージ、無ければ null。 */
export function validateInput(input: FixedAssetInput): string | null {
  if (!input.name.trim()) return "資産の名称を入力してください";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acquisition_date)) return "取得日を入力してください";
  if (input.service_start_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.service_start_date)) {
    return "事業供用日は日付で入力してください";
  }
  if (input.disposed_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.disposed_date)) {
    return "除却日は日付で入力してください";
  }
  if (!Number.isInteger(input.cost) || input.cost <= 0) {
    return "取得価額は正の整数で入力してください";
  }
  if (!Number.isInteger(input.useful_life_years) || input.useful_life_years < 1) {
    return "耐用年数は1以上の整数で入力してください";
  }
  if (
    !Number.isInteger(input.business_ratio_percent) ||
    input.business_ratio_percent < 0 ||
    input.business_ratio_percent > 100
  ) {
    return "事業専用割合は0〜100の整数で入力してください";
  }
  return null;
}
