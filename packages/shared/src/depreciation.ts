/**
 * depreciation.ts — 減価償却の決定的計算エンジン。
 *
 * 対応する償却方法（個人事業主・青色/白色共通の所得税の計算）:
 * - 定額法（straight_line）: 取得価額 × 定額法償却率。初年度のみ月割。
 * - 定率法（declining_balance）: 2012年4月1日以後取得の200%定率法。
 *   期首未償却残高 × 償却率。調整前償却額が償却保証額（取得価額×保証率）を
 *   下回った年から、改定取得価額 × 改定償却率 の均等償却に切り替える。
 * - 一括償却資産（lump_sum）: 10万円以上20万円未満を3年均等（月割なし）。
 * - 少額減価償却資産の特例（small_special）: 青色申告者の30万円未満を
 *   取得年に全額算入（年間合計300万円まで。措法28の2）。
 *
 * 償却率は耐用年数省令の別表第八（定額法）・別表第十（定率法）。
 * 定額法償却率は 1/耐用年数 を小数第3位まで切り上げた値で別表と一致する。
 * 定率法の3率は式では再現できないため別表第十の値を写した表を持つ。
 * 表は本実装で裏取りできた年数（2〜15年・20〜27年）のみ収録し、
 * それ以外の年数で定率法を指定した場合は例外にする（推測で計算しない）。
 *
 * 端数処理: 金額は円未満切り捨て。最終年は未償却残高が備忘価額1円に
 * なるよう調整する（2007年4月1日以後取得の残存価額なしの前提）。
 * 建物のように定額法しか選べない資産の判定は呼び出し側の責務とする。
 */

export type DepreciationMethod =
  | "straight_line"
  | "declining_balance"
  | "lump_sum"
  | "small_special";

export interface FixedAssetInput {
  /** 取得年月日 "YYYY-MM-DD" */
  acquisitionDate: string;
  /** 事業供用年月日。省略時は取得日 */
  serviceStartDate?: string;
  /** 取得価額（円） */
  cost: number;
  /** 耐用年数（年）。一括償却・少額特例では計算に使わないが台帳として保持する */
  usefulLifeYears: number;
  method: DepreciationMethod;
  /** 事業専用割合（不動産は貸付割合）0〜100 */
  businessRatioPercent: number;
}

export interface DepreciationYear {
  year: number;
  /** 本年中の償却期間（月） */
  months: number;
  /** 期首の未償却残高 */
  openingBookValue: number;
  /** 償却の基礎になる金額（定額法は取得価額、定率法の改定後は改定取得価額） */
  basisAmount: number;
  /** 使用した償却率（改定償却に切り替わった年以降は改定償却率）。一括・少額特例は 0 */
  rate: number;
  /** 償却保証額（定率法のみ。それ以外は null） */
  guaranteeAmount: number | null;
  /** 本年分の普通償却費（事業専用割合を掛ける前） */
  ordinary: number;
  /** 本年分の必要経費算入額（普通償却費 × 事業専用割合、円未満切捨て） */
  deductible: number;
  /** 期末の未償却残高 */
  closingBookValue: number;
}

/** 定額法の償却率（別表第八。1/年の小数第3位切り上げ） */
export function straightLineRate(usefulLifeYears: number): number {
  if (!Number.isInteger(usefulLifeYears) || usefulLifeYears < 2) {
    throw new Error(`耐用年数は2年以上の整数で指定してください: ${usefulLifeYears}`);
  }
  return Math.ceil((1 / usefulLifeYears) * 1000) / 1000;
}

export interface DecliningBalanceRates {
  /** 定率法の償却率 */
  rate: number;
  /** 改定償却率（2年は切替なしのため null） */
  revisedRate: number | null;
  /** 償却保証率（2年は null） */
  guaranteeRate: number | null;
}

/**
 * 200%定率法の率（別表第十）。[償却率, 改定償却率, 償却保証率]。
 * 2ソースで値が一致した年数のみ収録（16〜19年・28年以上は未収録）。
 */
const DECLINING_BALANCE_TABLE: Record<number, [number, number | null, number | null]> = {
  2: [1.0, null, null],
  3: [0.667, 1.0, 0.11089],
  4: [0.5, 1.0, 0.12499],
  5: [0.4, 0.5, 0.108],
  6: [0.333, 0.334, 0.09911],
  7: [0.286, 0.334, 0.0868],
  8: [0.25, 0.334, 0.07909],
  9: [0.222, 0.25, 0.07126],
  10: [0.2, 0.25, 0.06552],
  11: [0.182, 0.2, 0.05992],
  12: [0.167, 0.2, 0.05566],
  13: [0.154, 0.167, 0.0518],
  14: [0.143, 0.167, 0.04854],
  15: [0.133, 0.143, 0.04565],
  20: [0.1, 0.112, 0.03486],
  21: [0.095, 0.1, 0.03335],
  22: [0.091, 0.1, 0.03182],
  23: [0.087, 0.091, 0.03052],
  24: [0.083, 0.084, 0.02969],
  25: [0.08, 0.084, 0.02841],
  26: [0.077, 0.084, 0.02716],
  27: [0.074, 0.077, 0.02624],
};

/** 定率法（200%）の率を返す。率表に無い年数は例外。 */
export function decliningBalanceRates(usefulLifeYears: number): DecliningBalanceRates {
  const row = DECLINING_BALANCE_TABLE[usefulLifeYears];
  if (!row) {
    throw new Error(
      `耐用年数 ${usefulLifeYears} 年の定率法償却率表（別表第十）は未収録です。定額法を使うか、年数を見直してください`,
    );
  }
  return { rate: row[0], revisedRate: row[1], guaranteeRate: row[2] };
}

function parseYearMonth(date: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`日付の形式が不正です: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

function serviceStart(asset: FixedAssetInput): { year: number; month: number } {
  return parseYearMonth(asset.serviceStartDate ?? asset.acquisitionDate);
}

function deductibleOf(asset: FixedAssetInput, ordinary: number): number {
  return Math.floor((ordinary * asset.businessRatioPercent) / 100);
}

function makeYear(
  asset: FixedAssetInput,
  year: number,
  months: number,
  opening: number,
  basis: number,
  rate: number,
  guaranteeAmount: number | null,
  ordinary: number,
): DepreciationYear {
  const closing = opening - ordinary;
  return {
    year,
    months,
    openingBookValue: opening,
    basisAmount: basis,
    rate,
    guaranteeAmount,
    ordinary,
    deductible: deductibleOf(asset, ordinary),
    closingBookValue: closing,
  };
}

/**
 * 供用開始年から targetYear までの各年の償却を計算する。
 * targetYear が供用開始前なら空配列。償却が終わった年（残高1円）までで止まる。
 */
export function depreciationSchedule(
  asset: FixedAssetInput,
  targetYear: number,
): DepreciationYear[] {
  if (asset.cost <= 0) throw new Error("取得価額は正の金額で指定してください");
  if (asset.businessRatioPercent < 0 || asset.businessRatioPercent > 100) {
    throw new Error(`事業専用割合は0〜100で指定してください: ${asset.businessRatioPercent}`);
  }
  const start = serviceStart(asset);
  if (targetYear < start.year) return [];
  const firstYearMonths = 12 - start.month + 1;

  if (asset.method === "small_special") {
    // 取得年に全額償却し、未償却残高は0になる（備忘価額の対象外）
    return [makeYear(asset, start.year, firstYearMonths, asset.cost, asset.cost, 0, null, asset.cost)];
  }

  if (asset.method === "lump_sum") {
    const base = Math.floor(asset.cost / 3);
    const years: DepreciationYear[] = [];
    let opening = asset.cost;
    for (let i = 0; i < 3 && start.year + i <= targetYear; i++) {
      const ordinary = i < 2 ? base : asset.cost - base * 2;
      years.push(
        makeYear(asset, start.year + i, i === 0 ? firstYearMonths : 12, opening, asset.cost, 0, null, ordinary),
      );
      opening -= ordinary;
    }
    return years;
  }

  if (asset.method === "straight_line") {
    const rate = straightLineRate(asset.usefulLifeYears);
    const fullYearAmount = Math.floor(asset.cost * rate);
    const years: DepreciationYear[] = [];
    let opening = asset.cost;
    for (let year = start.year; year <= targetYear && opening > 1; year++) {
      const months = year === start.year ? firstYearMonths : 12;
      let ordinary =
        year === start.year
          ? Math.floor((asset.cost * rate * months) / 12)
          : fullYearAmount;
      if (opening - ordinary < 1) ordinary = opening - 1;
      years.push(makeYear(asset, year, months, opening, asset.cost, rate, null, ordinary));
      opening -= ordinary;
    }
    return years;
  }

  // declining_balance（200%定率法）
  const rates = decliningBalanceRates(asset.usefulLifeYears);
  const guaranteeAmount =
    rates.guaranteeRate !== null ? Math.floor(asset.cost * rates.guaranteeRate) : null;
  const years: DepreciationYear[] = [];
  let opening = asset.cost;
  let revisedBase: number | null = null;
  for (let year = start.year; year <= targetYear && opening > 1; year++) {
    const months = year === start.year ? firstYearMonths : 12;
    if (revisedBase === null && guaranteeAmount !== null && rates.revisedRate !== null) {
      const adjusted = Math.floor(opening * rates.rate);
      if (adjusted < guaranteeAmount) revisedBase = opening;
    }
    let ordinary: number;
    let basis: number;
    let usedRate: number;
    if (revisedBase !== null && rates.revisedRate !== null) {
      basis = revisedBase;
      usedRate = rates.revisedRate;
      ordinary = Math.floor(revisedBase * rates.revisedRate);
    } else {
      basis = opening;
      usedRate = rates.rate;
      const full = Math.floor(opening * rates.rate);
      ordinary = year === start.year ? Math.floor((full * months) / 12) : full;
    }
    if (opening - ordinary < 1) ordinary = opening - 1;
    years.push(makeYear(asset, year, months, opening, basis, usedRate, guaranteeAmount, ordinary));
    opening -= ordinary;
  }
  return years;
}

/** 指定年の償却（1年分）。その年に償却が無い（開始前・終了後）場合は null。 */
export function depreciationForYear(
  asset: FixedAssetInput,
  year: number,
): DepreciationYear | null {
  const schedule = depreciationSchedule(asset, year);
  const found = schedule.find((y) => y.year === year);
  return found ?? null;
}

/** 少額減価償却資産の特例の年間上限（300万円）に対する当年取得分の合計と超過判定。 */
export function smallSpecialUsage(
  assets: FixedAssetInput[],
  year: number,
): { total: number; cap: number; exceeded: boolean } {
  const cap = 3_000_000;
  let total = 0;
  for (const asset of assets) {
    if (asset.method !== "small_special") continue;
    if (serviceStart(asset).year === year) total += asset.cost;
  }
  return { total, cap, exceeded: total > cap };
}
