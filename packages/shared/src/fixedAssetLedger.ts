/**
 * fixedAssetLedger.ts — 固定資産台帳の画面で使う、資産ごと・年ごとの数値
 * （償却スケジュール・年末の未償却残高・必要経費算入額・償却の進み具合）、
 * 対象年のサマリ、登録入力の検証、表示名。Web と native の台帳画面が共有する。
 *
 * 資産は API のワイヤ形式（snake_case）で受ける。償却額そのものは
 * depreciationSchedule が決め、ここでは除却と対象年の扱いだけを決める。
 */
import {
  DepreciationMethod,
  DepreciationYear,
  FixedAssetInput,
  depreciationSchedule,
} from "./depreciation";

/** 固定資産台帳の1件のうち、償却と対象年の判定に使う項目（ワイヤ形式）。 */
export interface FixedAssetLedgerEntry {
  acquisition_date: string;
  service_start_date: string | null;
  cost: number;
  useful_life_years: number;
  method: DepreciationMethod;
  business_ratio_percent: number;
  disposed_date: string | null;
}

/** 登録・更新入力の検証に使う項目（ワイヤ形式）。 */
export interface FixedAssetLedgerInput extends FixedAssetLedgerEntry {
  name: string;
}

/** 償却方法の表示名。short は一覧の札、option は選択肢の説明つきの名前。並びは選択肢の順。 */
export const DEPRECIATION_METHOD_LABELS = {
  straight_line: { short: "定額法", option: "定額法" },
  declining_balance: { short: "定率法", option: "定率法（200%）" },
  lump_sum: { short: "一括償却", option: "一括償却（3年均等）" },
  small_special: { short: "少額特例", option: "少額減価償却資産の特例" },
} as const satisfies Record<DepreciationMethod, { short: string; option: string }>;

/** 固定資産の所得区分（台帳の income_type の値）。 */
export type FixedAssetIncomeType = "business" | "real_estate" | "agriculture";

/** 固定資産の所得区分の表示名。並びは選択肢の順。 */
export const FIXED_ASSET_INCOME_TYPE_LABELS = {
  business: "事業",
  real_estate: "不動産",
  agriculture: "農業",
} as const satisfies Record<FixedAssetIncomeType, string>;

/** 所得区分の表示名。台帳に未知の値が入っていればその値をそのまま返す。 */
export function fixedAssetIncomeTypeLabel(value: string): string {
  return Object.prototype.hasOwnProperty.call(FIXED_ASSET_INCOME_TYPE_LABELS, value)
    ? FIXED_ASSET_INCOME_TYPE_LABELS[value as FixedAssetIncomeType]
    : value;
}

/** 耐用年数の候補に出す、よく使う年数。候補に無い年数は数値で直接指定する。 */
export const USEFUL_LIFE_PRESETS: readonly number[] = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 47];

function toEngineInput(asset: FixedAssetLedgerEntry): FixedAssetInput {
  return {
    acquisitionDate: asset.acquisition_date,
    serviceStartDate: asset.service_start_date ?? undefined,
    cost: asset.cost,
    usefulLifeYears: asset.useful_life_years,
    method: asset.method,
    businessRatioPercent: asset.business_ratio_percent,
    disposalDate: asset.disposed_date ?? undefined,
  };
}

/** 除却した年。除却していなければ null。 */
export function disposedYearOf(asset: FixedAssetLedgerEntry): number | null {
  if (!asset.disposed_date) return null;
  const year = Number(asset.disposed_date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

/**
 * 全期間の償却スケジュール（供用開始年から残高が尽きる年まで。除却した定額法・
 * 定率法の資産は除却した年まで、一括償却資産は除却しても3年）。計算できない入力
 * （定率法の表に無い耐用年数など）は空にする。
 */
export function fixedAssetSchedule(asset: FixedAssetLedgerEntry): DepreciationYear[] {
  const startYear = Number((asset.service_start_date ?? asset.acquisition_date).slice(0, 4));
  if (!Number.isFinite(startYear)) return [];
  // 定率法でも残高は必ず尽きるが、耐用年数が長い資産でも計算の上限を置く。
  const lastYear = startYear + Math.max(asset.useful_life_years * 2, 10) + 5;
  try {
    return depreciationSchedule(toEngineInput(asset), lastYear);
  } catch {
    return [];
  }
}

/** 資産1件の、対象年の数値。スケジュールは1回だけ求める。 */
export interface FixedAssetYearFigures {
  schedule: DepreciationYear[];
  /** 対象年の必要経費算入額（償却が無い年・定額法と定率法の除却の翌年以降は 0） */
  deductible: number;
  /** 対象年末の未償却残高（定額法・定率法は除却後は除却年の残高で止まる） */
  bookValue: number;
  /** 償却の進み具合（0〜1） */
  progress: number;
}

export function fixedAssetYearFigures(
  asset: FixedAssetLedgerEntry,
  year: number,
): FixedAssetYearFigures {
  const schedule = fixedAssetSchedule(asset);
  let bookValue = asset.cost;
  for (const row of schedule) {
    if (row.year > year) break;
    bookValue = row.closingBookValue;
  }
  const deductible = schedule.find((row) => row.year === year)?.deductible ?? 0;
  const progress =
    asset.cost > 0 ? Math.min(1, Math.max(0, (asset.cost - bookValue) / asset.cost)) : 0;
  return { schedule, deductible, bookValue, progress };
}

/**
 * 対象年の一覧に出す資産か。その年のスケジュールに現れる資産を対象とする
 * （除却した資産は除却した年まで。一括償却資産は除却後も償却が続く年まで）。
 */
export function isFixedAssetInYear(asset: FixedAssetLedgerEntry, year: number): boolean {
  return fixedAssetSchedule(asset).some((row) => row.year === year);
}

/**
 * 対象年のサマリ（件数・取得価額の合計・年末の未償却残高の合計）。
 * 対象年の台帳に載るのは、対象年までに取得し、対象年より前に除却していない資産。
 */
export interface FixedAssetLedgerSummary {
  /** 対象年の台帳に載る資産の件数 */
  count: number;
  /** 対象年より前に除却した資産の件数 */
  disposedCount: number;
  totalCost: number;
  totalBookValue: number;
}

export function summarizeFixedAssets(
  assets: readonly FixedAssetLedgerEntry[],
  year: number,
): FixedAssetLedgerSummary {
  const acquired = assets.filter((asset) => Number(asset.acquisition_date.slice(0, 4)) <= year);
  const isDisposedBefore = (asset: FixedAssetLedgerEntry) => {
    const disposedYear = disposedYearOf(asset);
    return disposedYear !== null && disposedYear < year;
  };
  const active = acquired.filter((asset) => !isDisposedBefore(asset));
  return {
    count: active.length,
    disposedCount: acquired.length - active.length,
    totalCost: active.reduce((sum, asset) => sum + asset.cost, 0),
    totalBookValue: active.reduce(
      (sum, asset) => sum + fixedAssetYearFigures(asset, year).bookValue,
      0,
    ),
  };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 登録・更新入力の検証。問題があればメッセージ、無ければ null。 */
export function validateFixedAssetInput(input: FixedAssetLedgerInput): string | null {
  if (!input.name.trim()) return "資産の名称を入力してください";
  if (!DATE_PATTERN.test(input.acquisition_date)) return "取得日を入力してください";
  if (input.service_start_date && !DATE_PATTERN.test(input.service_start_date)) {
    return "事業供用日は日付で入力してください";
  }
  if (input.disposed_date && !DATE_PATTERN.test(input.disposed_date)) {
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
