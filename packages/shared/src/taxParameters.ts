/**
 * taxParameters.ts — 年度ごとの税務パラメータ（定数テーブル＋提供層）。
 *
 * 設計ルール（Kohei 指示 2026-11-23）: 法改正で年度ごとに変わる数値
 * （控除額・段階表・料率など）は、ここに年度キーの定数テーブルとして置き、
 * 計算ロジックは `taxParametersFor(year)` で引いた値を注入されて使う。
 * 年度による if/switch 分岐を計算側に書いてはならない。
 * テーブルに無い年分を要求されたら、推測で補わず明示的に例外にする。
 */

/** 所得の上限と金額の段階（上限以下ならその金額。上限は小さい順に並べる）。 */
export interface IncomeTier {
  upTo: number;
  amount: number;
}

/** 段階表から、値が最初に収まる段階の金額を返す。 */
export function lookupTier(tiers: readonly IncomeTier[], value: number): number {
  for (const tier of tiers) {
    if (value <= tier.upTo) return tier.amount;
  }
  return 0;
}

/** 給与所得控除の段階（収入金額の上限ごとに、定額または 率＋調整額）。 */
export interface SalaryDeductionTier {
  upTo: number;
  /** 定額の控除額（率方式の段階では未設定） */
  amount?: number;
  /** 率方式の率（例: 0.3） */
  rate?: number;
  /** 率方式の調整額（例: 80,000 / -100,000） */
  adjust?: number;
}

/** 1年分の税務パラメータ。 */
export interface YearTaxParameters {
  /** 基礎控除の段階表（合計所得金額 → 控除額）。 */
  basicDeductionTiers: readonly IncomeTier[];
  /**
   * 配偶者控除の所得要件（配偶者の合計所得の上限）。
   * 配偶者特別控除は、この額を超えたところから段階適用になる。
   */
  spouseIncomeLimit: number;
  /** 特定親族特別控除の段階表。その年分に制度が無い・未対応なら null（控除 0）。 */
  specialRelativeTiers: readonly IncomeTier[] | null;
  /** 特定親族特別控除の下限（この額以下は扶養控除の側）。 */
  specialRelativeLowerBound: number;
  /** 給与所得控除の段階表（国税庁 No.1410 の速算表）。 */
  salaryDeductionTiers: readonly SalaryDeductionTier[];
}

const INF = Number.POSITIVE_INFINITY;

/** 給与所得控除の段階表（令和2〜6年分。最低保障額55万円）。 */
const SALARY_TIERS_2023_2024: readonly SalaryDeductionTier[] = [
  { upTo: 1_625_000, amount: 550_000 },
  { upTo: 1_800_000, rate: 0.4, adjust: -100_000 },
  { upTo: 3_600_000, rate: 0.3, adjust: 80_000 },
  { upTo: 6_600_000, rate: 0.2, adjust: 440_000 },
  { upTo: 8_500_000, rate: 0.1, adjust: 1_100_000 },
  { upTo: INF, amount: 1_950_000 },
];

/** 給与所得控除の段階表（令和7年分。最低保障額65万円）。 */
const SALARY_TIERS_2025: readonly SalaryDeductionTier[] = [
  { upTo: 1_900_000, amount: 650_000 },
  { upTo: 3_600_000, rate: 0.3, adjust: 80_000 },
  { upTo: 6_600_000, rate: 0.2, adjust: 440_000 },
  { upTo: 8_500_000, rate: 0.1, adjust: 1_100_000 },
  { upTo: INF, amount: 1_950_000 },
];

/** 給与所得控除の段階表（令和8・9年分。最低保障額74万円）。 */
const SALARY_TIERS_2026_2027: readonly SalaryDeductionTier[] = [
  { upTo: 2_200_000, amount: 740_000 },
  { upTo: 3_600_000, rate: 0.3, adjust: 80_000 },
  { upTo: 6_600_000, rate: 0.2, adjust: 440_000 },
  { upTo: 8_500_000, rate: 0.1, adjust: 1_100_000 },
  { upTo: INF, amount: 1_950_000 },
];

/** 令和5・6年分の基礎控除（48万円、本則）。 */
const BASIC_TIERS_2023_2024: readonly IncomeTier[] = [
  { upTo: 24_000_000, amount: 480_000 },
  { upTo: 24_500_000, amount: 320_000 },
  { upTo: 25_000_000, amount: 160_000 },
  { upTo: INF, amount: 0 },
];

/** 特定親族特別控除の段階表（令和7年分、No.1177）。 */
const SPECIAL_RELATIVE_TIERS_2025: readonly IncomeTier[] = [
  { upTo: 850_000, amount: 630_000 },
  { upTo: 900_000, amount: 610_000 },
  { upTo: 950_000, amount: 510_000 },
  { upTo: 1_000_000, amount: 410_000 },
  { upTo: 1_050_000, amount: 310_000 },
  { upTo: 1_100_000, amount: 210_000 },
  { upTo: 1_150_000, amount: 110_000 },
  { upTo: 1_200_000, amount: 60_000 },
  { upTo: 1_230_000, amount: 30_000 },
];

/** 年度ごとの税務パラメータ。新しい年分は行を追加して対応する。 */
export const TAX_PARAMETERS: Readonly<Record<number, YearTaxParameters>> = {
  2023: {
    basicDeductionTiers: BASIC_TIERS_2023_2024,
    spouseIncomeLimit: 480_000,
    specialRelativeTiers: null,
    specialRelativeLowerBound: 480_000,
    salaryDeductionTiers: SALARY_TIERS_2023_2024,
  },
  2024: {
    basicDeductionTiers: BASIC_TIERS_2023_2024,
    spouseIncomeLimit: 480_000,
    specialRelativeTiers: null,
    specialRelativeLowerBound: 480_000,
    salaryDeductionTiers: SALARY_TIERS_2023_2024,
  },
  2025: {
    // 本則58万円＋令和7・8年分限りの上乗せ特例（措法41条の16の2）
    basicDeductionTiers: [
      { upTo: 1_320_000, amount: 950_000 },
      { upTo: 3_360_000, amount: 880_000 },
      { upTo: 4_890_000, amount: 680_000 },
      { upTo: 6_550_000, amount: 630_000 },
      { upTo: 23_500_000, amount: 580_000 },
      { upTo: 24_000_000, amount: 480_000 },
      { upTo: 24_500_000, amount: 320_000 },
      { upTo: 25_000_000, amount: 160_000 },
      { upTo: INF, amount: 0 },
    ],
    spouseIncomeLimit: 580_000,
    specialRelativeTiers: SPECIAL_RELATIVE_TIERS_2025,
    specialRelativeLowerBound: 580_000,
    salaryDeductionTiers: SALARY_TIERS_2025,
  },
  2026: {
    // 上乗せ特例が縮小（132万円以下は78万円）
    basicDeductionTiers: [
      { upTo: 1_320_000, amount: 780_000 },
      { upTo: 3_360_000, amount: 710_000 },
      { upTo: 4_890_000, amount: 630_000 },
      { upTo: 23_500_000, amount: 580_000 },
      { upTo: 24_000_000, amount: 480_000 },
      { upTo: 24_500_000, amount: 320_000 },
      { upTo: 25_000_000, amount: 160_000 },
      { upTo: INF, amount: 0 },
    ],
    spouseIncomeLimit: 580_000,
    // 令和8年分の段階表は所得基準が異なるため未収録（従来どおり控除 0）
    specialRelativeTiers: null,
    specialRelativeLowerBound: 580_000,
    salaryDeductionTiers: SALARY_TIERS_2026_2027,
  },
  2027: {
    // 上乗せ特例なし（本則のみ）
    basicDeductionTiers: [
      { upTo: 24_000_000, amount: 580_000 },
      { upTo: 24_500_000, amount: 320_000 },
      { upTo: 25_000_000, amount: 160_000 },
      { upTo: INF, amount: 0 },
    ],
    spouseIncomeLimit: 580_000,
    specialRelativeTiers: null,
    specialRelativeLowerBound: 580_000,
    salaryDeductionTiers: SALARY_TIERS_2026_2027,
  },
};

/**
 * 年度の税務パラメータを引く（ParameterProvider）。
 * テーブルに無い年分は推測で補わず例外にする。
 */
export function taxParametersFor(year: number): YearTaxParameters {
  const params = TAX_PARAMETERS[year];
  if (!params) {
    throw new Error(
      `${year}年分の税務パラメータは未定義です（対応年分: ${Object.keys(TAX_PARAMETERS).join(", ")}）`,
    );
  }
  return params;
}
