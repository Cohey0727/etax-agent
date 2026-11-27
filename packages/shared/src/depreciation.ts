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
 * 表は別表第十の全範囲（2〜100年）を収録済み（e-Gov 原文＋2ソースで
 * 照合）。表に無い年数で定率法を指定した場合は例外にする（推測で計算しない）。
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
 * 出典：e-Gov「減価償却資産の耐用年数等に関する省令」別表第十（原文）。
 * 別表第十は2〜100年。
 * 保証率は単調ではなく節目で上がる箇所がある（例：73年 0.01063）が、
 * 原文どおりの値である。
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
  16: [0.125, 0.143, 0.04294],
  17: [0.118, 0.125, 0.04038],
  18: [0.111, 0.112, 0.03884],
  19: [0.105, 0.112, 0.03693],
  20: [0.1, 0.112, 0.03486],
  21: [0.095, 0.1, 0.03335],
  22: [0.091, 0.1, 0.03182],
  23: [0.087, 0.091, 0.03052],
  24: [0.083, 0.084, 0.02969],
  25: [0.08, 0.084, 0.02841],
  26: [0.077, 0.084, 0.02716],
  27: [0.074, 0.077, 0.02624],
  28: [0.071, 0.072, 0.02568],
  29: [0.069, 0.072, 0.02463],
  30: [0.067, 0.072, 0.02366],
  31: [0.065, 0.067, 0.02286],
  32: [0.063, 0.067, 0.02216],
  33: [0.061, 0.063, 0.02161],
  34: [0.059, 0.063, 0.02097],
  35: [0.057, 0.059, 0.02051],
  36: [0.056, 0.059, 0.01974],
  37: [0.054, 0.056, 0.0195],
  38: [0.053, 0.056, 0.01882],
  39: [0.051, 0.053, 0.0186],
  40: [0.05, 0.053, 0.01791],
  41: [0.049, 0.05, 0.01741],
  42: [0.048, 0.05, 0.01694],
  43: [0.047, 0.048, 0.01664],
  44: [0.045, 0.046, 0.01664],
  45: [0.044, 0.046, 0.01634],
  46: [0.043, 0.044, 0.01601],
  47: [0.043, 0.044, 0.01532],
  48: [0.042, 0.044, 0.01499],
  49: [0.041, 0.042, 0.01475],
  50: [0.04, 0.042, 0.0144],
  51: [0.039, 0.04, 0.01422],
  52: [0.038, 0.039, 0.01422],
  53: [0.038, 0.039, 0.0137],
  54: [0.037, 0.038, 0.0137],
  55: [0.036, 0.038, 0.01337],
  56: [0.036, 0.038, 0.01288],
  57: [0.035, 0.036, 0.01281],
  58: [0.034, 0.035, 0.01281],
  59: [0.034, 0.035, 0.0124],
  60: [0.033, 0.034, 0.0124],
  61: [0.033, 0.034, 0.01201],
  62: [0.032, 0.033, 0.01201],
  63: [0.032, 0.033, 0.01165],
  64: [0.031, 0.032, 0.01165],
  65: [0.031, 0.032, 0.0113],
  66: [0.03, 0.031, 0.0113],
  67: [0.03, 0.031, 0.01097],
  68: [0.029, 0.03, 0.01097],
  69: [0.029, 0.03, 0.01065],
  70: [0.029, 0.03, 0.01034],
  71: [0.028, 0.029, 0.01034],
  72: [0.028, 0.029, 0.01006],
  73: [0.027, 0.027, 0.01063],
  74: [0.027, 0.027, 0.01035],
  75: [0.027, 0.027, 0.01007],
  76: [0.026, 0.027, 0.0098],
  77: [0.026, 0.027, 0.00954],
  78: [0.026, 0.027, 0.00929],
  79: [0.025, 0.026, 0.00929],
  80: [0.025, 0.026, 0.00907],
  81: [0.025, 0.026, 0.00884],
  82: [0.024, 0.024, 0.00929],
  83: [0.024, 0.024, 0.00907],
  84: [0.024, 0.024, 0.00885],
  85: [0.024, 0.024, 0.00864],
  86: [0.023, 0.023, 0.00885],
  87: [0.023, 0.023, 0.00864],
  88: [0.023, 0.023, 0.00844],
  89: [0.022, 0.022, 0.00863],
  90: [0.022, 0.022, 0.00844],
  91: [0.022, 0.022, 0.00825],
  92: [0.022, 0.022, 0.00807],
  93: [0.022, 0.022, 0.0079],
  94: [0.021, 0.021, 0.00807],
  95: [0.021, 0.021, 0.0079],
  96: [0.021, 0.021, 0.00773],
  97: [0.021, 0.021, 0.00757],
  98: [0.02, 0.02, 0.00773],
  99: [0.02, 0.02, 0.00757],
  100: [0.02, 0.02, 0.00742],
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
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`日付の形式が不正です: ${date}`);
  return { year: Number(m[1]), month };
}

/**
 * 金額 × 償却率（円未満切り捨て）。率は小数第5位までの表値なので、
 * 率を10万倍した整数で乗算して float の丸め誤差を避ける
 * （例: 10,000 × 0.143 は float では 1,429.9999… になり 1,429 に
 * 切り捨てられてしまうが、正しくは 1,430）。
 */
const RATE_SCALE = 100_000;
function mulRate(amount: number, rate: number): number {
  return Math.floor((amount * Math.round(rate * RATE_SCALE)) / RATE_SCALE);
}

/** 金額 × 償却率 × 月数/12（初年度の月割。フロアは1回だけに統一する）。 */
function mulRateMonths(amount: number, rate: number, months: number): number {
  return Math.floor(
    (amount * Math.round(rate * RATE_SCALE) * months) / (RATE_SCALE * 12),
  );
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
  if (!Number.isFinite(asset.cost) || asset.cost <= 0) {
    throw new Error("取得価額は正の金額で指定してください");
  }
  if (
    !Number.isFinite(asset.businessRatioPercent) ||
    asset.businessRatioPercent < 0 ||
    asset.businessRatioPercent > 100
  ) {
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
    const fullYearAmount = mulRate(asset.cost, rate);
    const years: DepreciationYear[] = [];
    let opening = asset.cost;
    for (let year = start.year; year <= targetYear && opening > 1; year++) {
      const months = year === start.year ? firstYearMonths : 12;
      let ordinary =
        year === start.year
          ? mulRateMonths(asset.cost, rate, months)
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
    rates.guaranteeRate !== null ? mulRate(asset.cost, rates.guaranteeRate) : null;
  const years: DepreciationYear[] = [];
  let opening = asset.cost;
  let revisedBase: number | null = null;
  for (let year = start.year; year <= targetYear && opening > 1; year++) {
    const months = year === start.year ? firstYearMonths : 12;
    if (revisedBase === null && guaranteeAmount !== null && rates.revisedRate !== null) {
      const adjusted = mulRate(opening, rates.rate);
      if (adjusted < guaranteeAmount) revisedBase = opening;
    }
    let ordinary: number;
    let basis: number;
    let usedRate: number;
    if (revisedBase !== null && rates.revisedRate !== null) {
      basis = revisedBase;
      usedRate = rates.revisedRate;
      ordinary = mulRate(revisedBase, rates.revisedRate);
    } else {
      basis = opening;
      usedRate = rates.rate;
      // 初年度の月割は定額法と同じく「基礎金額 × 率 × 月数/12」を1回で切り捨てる
      ordinary =
        year === start.year
          ? mulRateMonths(opening, rates.rate, months)
          : mulRate(opening, rates.rate);
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

/** 決算書・収支内訳書の「減価償却費の計算」欄に出す1行分。 */
export interface DepreciationDetailRow {
  /** 減価償却資産の名称等 */
  name: string;
  /** 面積又は数量（任意） */
  quantity: string;
  /** 取得年月 "YYYY-MM" */
  acquisitionYearMonth: string;
  cost: number;
  /** 償却保証額（定率法のみ） */
  guaranteeAmount: number | null;
  /** 償却の基礎になる金額 */
  basisAmount: number;
  method: DepreciationMethod;
  /** 様式に出す償却方法の表示名 */
  methodLabel: string;
  usefulLifeYears: number;
  /** 償却率又は改定償却率 */
  rate: number;
  /** 本年中の償却期間（月） */
  months: number;
  /** 本年分の普通償却費 */
  ordinary: number;
  /** 本年分の償却費合計（特別償却は未対応のため普通償却費と同額） */
  total: number;
  /** 事業専用割合（不動産は貸付割合） */
  businessRatioPercent: number;
  /** 本年分の必要経費算入額 */
  deductible: number;
  /** 未償却残高（期末） */
  closingBookValue: number;
}

const METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: "定額法",
  declining_balance: "定率法",
  lump_sum: "一括償却",
  small_special: "少額特例",
};

/** 資産と年から決算書明細の1行を作る。その年に償却が無ければ null。 */
export function depreciationDetailRow(
  name: string,
  asset: FixedAssetInput,
  year: number,
  quantity = "",
): DepreciationDetailRow | null {
  const result = depreciationForYear(asset, year);
  if (!result) return null;
  const acq = parseYearMonth(asset.acquisitionDate);
  const mm = String(acq.month).padStart(2, "0");
  return {
    name,
    quantity,
    acquisitionYearMonth: `${acq.year}-${mm}`,
    cost: asset.cost,
    guaranteeAmount: result.guaranteeAmount,
    basisAmount: result.basisAmount,
    method: asset.method,
    methodLabel: METHOD_LABELS[asset.method],
    usefulLifeYears: asset.usefulLifeYears,
    rate: result.rate,
    months: result.months,
    ordinary: result.ordinary,
    total: result.ordinary,
    businessRatioPercent: asset.businessRatioPercent,
    deductible: result.deductible,
    closingBookValue: result.closingBookValue,
  };
}
