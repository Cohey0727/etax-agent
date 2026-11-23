/**
 * deductions.ts — 所得控除・税額控除・所得税額の計算（純粋関数群）。
 *
 * taxcalc.ts（所得の切り分け・青色申告特別控除・消費税）から先の
 * 「所得控除 → 課税所得 → 所得税額 → 税額控除 → 復興特別所得税 → 確定税額」
 * のパイプラインを担う。金額の計算は LLM に依存しない決定的な関数のみ。
 *
 * 根拠は国税庁タックスアンサー（令和5〜7年分）:
 *   雑損控除 No.1110 / 医療費控除 No.1120 / 社会保険料控除 No.1130 /
 *   小規模企業共済等掛金控除 No.1135 / 生命保険料控除 No.1140 /
 *   地震保険料控除 No.1145 / 寄附金控除 No.1150 / 障害者控除 No.1160 /
 *   寡婦控除 No.1170 / ひとり親控除 No.1171 / 勤労学生控除 No.1175 /
 *   特定親族特別控除 No.1177（令和7年分新設）/ 扶養控除 No.1180 /
 *   配偶者控除 No.1191 / 配偶者特別控除 No.1195 / 基礎控除 No.1199 /
 *   税率 No.2260 / 住宅借入金等特別控除 No.1211-1 / 配当控除 No.1250
 * 端数処理: 課税所得金額は1,000円未満切捨て（国税通則法118条）、
 *   確定税額は100円未満切捨て（同119条）。復興特別所得税は
 *   税額控除後の所得税額（基準所得税額）× 2.1%（円未満切捨て）。
 *
 * 前提・簡略化（呼び出し側の責任範囲）:
 * - 合計所得金額は「青色申告特別控除後の所得の合計」を呼び出し側が渡す。
 * - 配偶者控除・扶養控除・障害者控除などは、対象者の合計所得が要件以下で
 *   あることを呼び出し側（入力UI）が確認し、区分・人数だけを渡す。
 *   ただし配偶者特別控除と特定親族特別控除は、対象者の合計所得金額で
 *   控除額が段階的に変わるため、その金額自体を入力として段階表を適用する。
 * - 寡婦控除とひとり親控除は併用できない（入力UI側で排他にする前提）。
 * - 医療費控除とセルフメディケーション税制は選択制。本モジュールは
 *   通常の医療費控除のみを計算する。
 */
import { lookupTier, taxParametersFor } from "./taxParameters";

/** 円未満を切り捨てる。浮動小数の誤差吸収つき（taxcalc.ts と同じ流儀）。 */
function floorYen(x: number): number {
  return Math.floor(x + 1e-9);
}

/** 100円未満を切り捨てる（住宅借入金等特別控除・確定税額などの端数処理）。 */
function floor100(x: number): number {
  return Math.floor((x + 1e-9) / 100) * 100;
}

/** 金額入力を非負の整数に正規化する。 */
function amount(x: number): number {
  const n = Math.trunc(x || 0);
  return n > 0 ? n : 0;
}

/** 人数を非負の整数に正規化する。 */
function count(x: number): number {
  const n = Math.trunc(x || 0);
  return n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// 基礎控除（No.1199）
// ---------------------------------------------------------------------------

/**
 * 基礎控除。合計所得金額と年分で決まる。年度ごとの段階表は
 * taxParameters（TAX_PARAMETERS）が持ち、ここでは引いて適用するだけ。
 * - 令和5・6年分: 48万円（2,400万円超で逓減、2,500万円超は0）
 * - 令和7年分: 本則58万円への改正＋令和7・8年分限りの上乗せ特例で、
 *   132万円以下は95万円になる（措法41条の16の2）
 * - 令和8年分: 上乗せ特例が縮小（132万円以下は78万円）
 * - 令和9年分以降: 上乗せなし（本則のみ。655万円超も58万円）
 */
export function basicDeduction(year: number, totalIncome: number): number {
  return lookupTier(taxParametersFor(year).basicDeductionTiers, amount(totalIncome));
}

// ---------------------------------------------------------------------------
// 配偶者控除・配偶者特別控除（No.1191 / No.1195）
// ---------------------------------------------------------------------------

/** 配偶者の区分。"none" は配偶者なし、または要件を満たさない場合。 */
export type SpouseCategory = "none" | "general" | "elderly";

/**
 * 配偶者控除。本人の合計所得金額で逓減する。
 * 配偶者の合計所得が要件（令和7年分: 58万円以下、令和6年分以前: 48万円以下）
 * を満たすことは呼び出し側の前提。
 */
export function spouseDeduction(category: SpouseCategory, totalIncome: number): number {
  if (category === "none") return 0;
  const t = amount(totalIncome);
  if (t > 10_000_000) return 0;
  if (category === "elderly") {
    if (t <= 9_000_000) return 480_000;
    if (t <= 9_500_000) return 320_000;
    return 160_000;
  }
  if (t <= 9_000_000) return 380_000;
  if (t <= 9_500_000) return 260_000;
  return 130_000;
}

/** 配偶者特別控除の段階表: [配偶者の合計所得の上限, [本人900万円以下, 950万円以下, 1,000万円以下] の控除額] */
const SPOUSE_SPECIAL_TIERS: { upTo: number; amounts: [number, number, number] }[] = [
  { upTo: 950_000, amounts: [380_000, 260_000, 130_000] },
  { upTo: 1_000_000, amounts: [360_000, 240_000, 120_000] },
  { upTo: 1_050_000, amounts: [310_000, 210_000, 110_000] },
  { upTo: 1_100_000, amounts: [260_000, 180_000, 90_000] },
  { upTo: 1_150_000, amounts: [210_000, 140_000, 70_000] },
  { upTo: 1_200_000, amounts: [160_000, 110_000, 60_000] },
  { upTo: 1_250_000, amounts: [110_000, 80_000, 40_000] },
  { upTo: 1_300_000, amounts: [60_000, 40_000, 20_000] },
  { upTo: 1_330_000, amounts: [30_000, 20_000, 10_000] },
];

/**
 * 配偶者特別控除。配偶者の合計所得金額が、配偶者控除の要件
 * （令和7年分: 58万円、令和6年分以前: 48万円）を超え133万円以下のときに
 * 段階的に適用される。本人の合計所得が1,000万円を超えると適用なし。
 * spouseTotalIncome が null（配偶者なし等）なら 0。
 */
export function spouseSpecialDeduction(
  year: number,
  spouseTotalIncome: number | null,
  totalIncome: number,
): number {
  if (spouseTotalIncome === null) return 0;
  const s = amount(spouseTotalIncome);
  const lowerBound = taxParametersFor(year).spouseIncomeLimit;
  if (s <= lowerBound) return 0; // 配偶者控除の側（または対象外）
  const t = amount(totalIncome);
  if (t > 10_000_000) return 0;
  const tierIndex: 0 | 1 | 2 = t <= 9_000_000 ? 0 : t <= 9_500_000 ? 1 : 2;
  for (const tier of SPOUSE_SPECIAL_TIERS) {
    if (s <= tier.upTo) return tier.amounts[tierIndex] as number;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 特定親族特別控除（No.1177、令和7年分新設）
// ---------------------------------------------------------------------------

/**
 * 特定親族特別控除。19歳以上23歳未満の親族（配偶者・専従者等を除く）が
 * 扶養控除の対象にならない場合に、その親族の合計所得金額に応じて
 * 適用される。段階表は年度パラメータ（taxParameters）が持ち、制度が
 * 無い・段階表が未収録の年分は 0 を返す。対象が複数いる場合は
 * 呼び出し側で1人ずつ計算して合計すること。
 * relativeTotalIncome が null なら 0。
 */
export function specialRelativeDeduction(
  year: number,
  relativeTotalIncome: number | null,
): number {
  if (relativeTotalIncome === null) return 0;
  const params = taxParametersFor(year);
  if (!params.specialRelativeTiers) return 0;
  const s = amount(relativeTotalIncome);
  if (s <= params.specialRelativeLowerBound) return 0; // 扶養控除の側（または対象外）
  return lookupTier(params.specialRelativeTiers, s);
}

// ---------------------------------------------------------------------------
// 扶養控除・障害者控除（No.1180 / No.1160）
// ---------------------------------------------------------------------------

export interface DependentCounts {
  /** 一般の扶養親族（16歳以上）: 1人 380,000円 */
  general: number;
  /** 特定扶養親族（19歳以上23歳未満）: 1人 630,000円 */
  specific: number;
  /** 老人扶養親族（70歳以上・同居老親等以外）: 1人 480,000円 */
  elderly: number;
  /** 同居老親等: 1人 580,000円 */
  elderlyCohabiting: number;
}

/** 扶養控除。区分ごとの人数から計算する。 */
export function dependentDeduction(counts: DependentCounts): number {
  return (
    count(counts.general) * 380_000 +
    count(counts.specific) * 630_000 +
    count(counts.elderly) * 480_000 +
    count(counts.elderlyCohabiting) * 580_000
  );
}

export interface DisabilityCounts {
  /** 障害者: 1人 270,000円 */
  general: number;
  /** 特別障害者: 1人 400,000円 */
  special: number;
  /** 同居特別障害者: 1人 750,000円 */
  specialCohabiting: number;
}

/** 障害者控除。区分ごとの人数から計算する（本人分も人数に含めて渡す）。 */
export function disabilityDeduction(counts: DisabilityCounts): number {
  return (
    count(counts.general) * 270_000 +
    count(counts.special) * 400_000 +
    count(counts.specialCohabiting) * 750_000
  );
}

// ---------------------------------------------------------------------------
// 生命保険料控除（No.1140）
// ---------------------------------------------------------------------------

export interface LifeInsurancePremiums {
  /** 新契約: 一般生命保険料 */
  newGeneral: number;
  /** 新契約: 介護医療保険料 */
  newCareMedical: number;
  /** 新契約: 個人年金保険料 */
  newPension: number;
  /** 旧契約: 一般生命保険料 */
  oldGeneral: number;
  /** 旧契約: 個人年金保険料 */
  oldPension: number;
}

/** 新契約（平成24年1月1日以後締結）の計算式。区分ごとの上限は40,000円。 */
export function lifeInsuranceNewFormula(premium: number): number {
  const p = amount(premium);
  if (p <= 20_000) return p;
  if (p <= 40_000) return Math.floor(p / 2) + 10_000;
  if (p <= 80_000) return Math.floor(p / 4) + 20_000;
  return 40_000;
}

/** 旧契約（平成23年12月31日以前締結）の計算式。区分ごとの上限は50,000円。 */
export function lifeInsuranceOldFormula(premium: number): number {
  const p = amount(premium);
  if (p <= 25_000) return p;
  if (p <= 50_000) return Math.floor(p / 2) + 12_500;
  if (p <= 100_000) return Math.floor(p / 4) + 25_000;
  return 50_000;
}

/**
 * 新旧両方の契約がある区分（一般・個人年金）の控除額。
 * 旧契約の支払保険料が60,000円を超える場合は旧契約の式のみで計算し、
 * 60,000円以下の場合は新旧の式の合計（上限40,000円）とする
 * （国税庁 No.1140 の「新契約と旧契約の双方に加入している場合」）。
 */
function lifeInsuranceCategoryDeduction(newPremium: number, oldPremium: number): number {
  const n = amount(newPremium);
  const o = amount(oldPremium);
  if (n > 0 && o > 0) {
    if (o > 60_000) return lifeInsuranceOldFormula(o);
    return Math.min(lifeInsuranceNewFormula(n) + lifeInsuranceOldFormula(o), 40_000);
  }
  if (o > 0) return lifeInsuranceOldFormula(o);
  return lifeInsuranceNewFormula(n);
}

/** 生命保険料控除。全体の上限は120,000円。 */
export function lifeInsuranceDeduction(premiums: LifeInsurancePremiums): number {
  const total =
    lifeInsuranceCategoryDeduction(premiums.newGeneral, premiums.oldGeneral) +
    lifeInsuranceNewFormula(premiums.newCareMedical) +
    lifeInsuranceCategoryDeduction(premiums.newPension, premiums.oldPension);
  return Math.min(total, 120_000);
}

// ---------------------------------------------------------------------------
// 地震保険料控除（No.1145）
// ---------------------------------------------------------------------------

export interface EarthquakeInsurancePremiums {
  /** 地震保険料（地震等相当部分）の支払額 */
  earthquake: number;
  /** 旧長期損害保険料（平成18年12月31日以前締結・保険期間10年以上等）の支払額 */
  oldLongTerm: number;
}

/** 旧長期損害保険料の計算式。上限は15,000円。 */
export function oldLongTermDamageFormula(premium: number): number {
  const p = amount(premium);
  if (p <= 10_000) return p;
  if (p <= 20_000) return Math.floor(p / 2) + 5_000;
  return 15_000;
}

/** 地震保険料控除。地震部分は支払額の全額（上限50,000円）、旧長期との合計も上限50,000円。 */
export function earthquakeInsuranceDeduction(premiums: EarthquakeInsurancePremiums): number {
  const eq = Math.min(amount(premiums.earthquake), 50_000);
  const lt = oldLongTermDamageFormula(premiums.oldLongTerm);
  return Math.min(eq + lt, 50_000);
}

// ---------------------------------------------------------------------------
// 医療費控除・寄附金控除・雑損控除（No.1120 / No.1150 / No.1110）
// ---------------------------------------------------------------------------

/**
 * 医療費控除（通常分）。(支払額 − 補填金) − 足切り額。
 * 足切り額は総所得金額等が200万円未満なら その5%、それ以外は100,000円。
 * 上限は2,000,000円。
 */
export function medicalDeduction(
  paid: number,
  reimbursement: number,
  totalIncome: number,
): number {
  const base = amount(paid) - amount(reimbursement);
  if (base <= 0) return 0;
  const t = amount(totalIncome);
  const threshold = t < 2_000_000 ? Math.floor(t * 0.05) : 100_000;
  return Math.min(Math.max(base - threshold, 0), 2_000_000);
}

/**
 * 寄附金控除（所得控除）。min(特定寄附金の合計, 総所得金額等 × 40%) − 2,000円。
 * ふるさと納税も確定申告ではこの控除で扱う（住民税側の特例分は別計算）。
 */
export function donationDeduction(donationsTotal: number, totalIncome: number): number {
  const cap = Math.floor(amount(totalIncome) * 0.4);
  return Math.max(Math.min(amount(donationsTotal), cap) - 2_000, 0);
}

export interface CasualtyLossInput {
  /** 損害金額（資産の時価を基礎とした損害額） */
  damageAmount: number;
  /** 災害関連支出の金額（滅失家屋の取壊し・除去費用など） */
  disasterRelatedExpenses: number;
  /** その他の関連支出の金額（原状回復費など） */
  otherRelatedExpenses: number;
  /** 保険金・損害賠償金等で補填される金額 */
  compensation: number;
}

/**
 * 雑損控除。次の2つのうち大きい方:
 *   (1)（損害金額 + 関連支出 − 補填金）− 総所得金額等 × 10%
 *   (2)（災害関連支出 − 補填金）− 50,000円
 */
export function casualtyLossDeduction(input: CasualtyLossInput, totalIncome: number): number {
  const damage = amount(input.damageAmount);
  const disaster = amount(input.disasterRelatedExpenses);
  const other = amount(input.otherRelatedExpenses);
  const comp = amount(input.compensation);
  const a = damage + disaster + other - comp - Math.floor(amount(totalIncome) * 0.1);
  const b = disaster - comp - 50_000;
  return Math.max(a, b, 0);
}

// ---------------------------------------------------------------------------
// 所得控除の合算
// ---------------------------------------------------------------------------

export interface DeductionInputs {
  /** 社会保険料の支払額（全額が控除） */
  socialInsurancePaid: number;
  /** 小規模企業共済等掛金の支払額（小規模企業共済・iDeCo等、全額が控除） */
  smallBusinessMutualAidPaid: number;
  lifeInsurance: LifeInsurancePremiums;
  earthquakeInsurance: EarthquakeInsurancePremiums;
  /** 医療費の支払額 */
  medicalExpensesPaid: number;
  /** 医療費の補填金（保険金等） */
  medicalReimbursement: number;
  /** 特定寄附金の合計（ふるさと納税を含む） */
  donationsTotal: number;
  /** 雑損控除の入力。損失がなければ null */
  casualtyLoss: CasualtyLossInput | null;
  spouseCategory: SpouseCategory;
  /** 配偶者の合計所得金額（配偶者特別控除の判定用）。配偶者がいなければ null */
  spouseTotalIncome: number | null;
  dependents: DependentCounts;
  disability: DisabilityCounts;
  /** 寡婦控除（ひとり親に該当しないことが前提） */
  isWidow: boolean;
  /** ひとり親控除 */
  isSingleParent: boolean;
  /** 勤労学生控除 */
  isWorkingStudent: boolean;
  /** 特定親族（19歳以上23歳未満）の合計所得金額。いなければ null */
  specialRelativeTotalIncome: number | null;
}

export const EMPTY_DEDUCTION_INPUTS: DeductionInputs = {
  socialInsurancePaid: 0,
  smallBusinessMutualAidPaid: 0,
  lifeInsurance: { newGeneral: 0, newCareMedical: 0, newPension: 0, oldGeneral: 0, oldPension: 0 },
  earthquakeInsurance: { earthquake: 0, oldLongTerm: 0 },
  medicalExpensesPaid: 0,
  medicalReimbursement: 0,
  donationsTotal: 0,
  casualtyLoss: null,
  spouseCategory: "none",
  spouseTotalIncome: null,
  dependents: { general: 0, specific: 0, elderly: 0, elderlyCohabiting: 0 },
  disability: { general: 0, special: 0, specialCohabiting: 0 },
  isWidow: false,
  isSingleParent: false,
  isWorkingStudent: false,
  specialRelativeTotalIncome: null,
};

export interface IncomeDeductionBreakdown {
  casualtyLoss: number;
  medical: number;
  socialInsurance: number;
  smallBusinessMutualAid: number;
  lifeInsurance: number;
  earthquakeInsurance: number;
  donations: number;
  disability: number;
  widow: number;
  singleParent: number;
  workingStudent: number;
  spouse: number;
  spouseSpecial: number;
  dependents: number;
  specialRelative: number;
  basic: number;
  /** 所得控除の合計 */
  total: number;
}

/** 所得控除の内訳と合計を計算する。基礎控除は合計所得金額から自動で決まる。 */
export function computeIncomeDeductions(
  year: number,
  totalIncome: number,
  inputs: DeductionInputs,
): IncomeDeductionBreakdown {
  const breakdown: IncomeDeductionBreakdown = {
    casualtyLoss: inputs.casualtyLoss ? casualtyLossDeduction(inputs.casualtyLoss, totalIncome) : 0,
    medical: medicalDeduction(inputs.medicalExpensesPaid, inputs.medicalReimbursement, totalIncome),
    socialInsurance: amount(inputs.socialInsurancePaid),
    smallBusinessMutualAid: amount(inputs.smallBusinessMutualAidPaid),
    lifeInsurance: lifeInsuranceDeduction(inputs.lifeInsurance),
    earthquakeInsurance: earthquakeInsuranceDeduction(inputs.earthquakeInsurance),
    donations: donationDeduction(inputs.donationsTotal, totalIncome),
    disability: disabilityDeduction(inputs.disability),
    widow: inputs.isWidow ? 270_000 : 0,
    singleParent: inputs.isSingleParent ? 350_000 : 0,
    workingStudent: inputs.isWorkingStudent ? 270_000 : 0,
    spouse: spouseDeduction(inputs.spouseCategory, totalIncome),
    spouseSpecial: spouseSpecialDeduction(year, inputs.spouseTotalIncome, totalIncome),
    dependents: dependentDeduction(inputs.dependents),
    specialRelative: specialRelativeDeduction(year, inputs.specialRelativeTotalIncome),
    basic: basicDeduction(year, totalIncome),
    total: 0,
  };
  breakdown.total =
    breakdown.casualtyLoss +
    breakdown.medical +
    breakdown.socialInsurance +
    breakdown.smallBusinessMutualAid +
    breakdown.lifeInsurance +
    breakdown.earthquakeInsurance +
    breakdown.donations +
    breakdown.disability +
    breakdown.widow +
    breakdown.singleParent +
    breakdown.workingStudent +
    breakdown.spouse +
    breakdown.spouseSpecial +
    breakdown.dependents +
    breakdown.specialRelative +
    breakdown.basic;
  return breakdown;
}

// ---------------------------------------------------------------------------
// 税額控除
// ---------------------------------------------------------------------------

export interface TaxCreditInputs {
  /** 住宅借入金等の年末残高 */
  housingLoanBalance: number;
  /** 住宅借入金等特別控除の限度額（控除額の上限） */
  housingLoanLimit: number;
  /** 住宅借入金等特別控除の率（2022年以降の居住は 0.007、2021年以前の居住は 0.01） */
  housingLoanRate: number;
  /** 総合課税の配当等の金額（剰余金の配当・利益の配当等） */
  dividendCorporate: number;
  /** 総合課税の証券投資信託の収益の分配の金額 */
  dividendTrust: number;
  /** 政党等寄附金の額 */
  politicalDonations: number;
  /** 認定NPO法人・公益社団法人等への寄附金の額 */
  certifiedNpoDonations: number;
  /** 住宅耐震改修: 耐震改修に係る標準的な費用の額（A） */
  seismicRetrofitStandardCost: number;
  /** 住宅耐震改修: (A) 以外の耐震工事に係る一定の金額（B） */
  seismicRetrofitOtherCost: number;
  /** 外国所得税の額 */
  foreignTaxPaid: number;
  /** 調整国外所得金額 */
  foreignIncome: number;
  /** 定額減税額（令和6年分のみ。本人と同一生計配偶者・扶養親族の人数 × ¥30,000） */
  flatReduction: number;
}

export const EMPTY_TAX_CREDIT_INPUTS: TaxCreditInputs = {
  housingLoanBalance: 0,
  housingLoanLimit: 0,
  housingLoanRate: 0.007,
  dividendCorporate: 0,
  dividendTrust: 0,
  politicalDonations: 0,
  certifiedNpoDonations: 0,
  seismicRetrofitStandardCost: 0,
  seismicRetrofitOtherCost: 0,
  foreignTaxPaid: 0,
  foreignIncome: 0,
  flatReduction: 0,
};

/**
 * 住宅借入金等特別控除: 年末残高 × 率（100円未満切捨て）、限度額が上限。
 * 率は居住年で決まる（2022年以降 0.7% / 2021年以前 1%）。
 */
export function housingLoanCredit(balance: number, limit: number, rate = 0.007): number {
  const b = amount(balance);
  const l = amount(limit);
  const r = rate > 0 ? rate : 0.007;
  if (b <= 0 || l <= 0) return 0;
  return Math.min(floor100(b * r), l);
}

/**
 * 配当控除（No.1250）。課税総所得金額等のうち1,000万円以下の部分に
 * 対応する配当等は 剰余金配当等 10%・証券投資信託 5%、超過部分は半率。
 * 配当以外の所得を先に1,000万円の枠へ積む前提で、配当の按分を行う。
 * taxableTotalIncome は配当所得を含む課税総所得金額等。
 */
export function dividendCredit(
  dividendCorporate: number,
  dividendTrust: number,
  taxableTotalIncome: number,
): number {
  const corp = amount(dividendCorporate);
  const trust = amount(dividendTrust);
  const total = corp + trust;
  if (total <= 0) return 0;
  const baseWithoutDividend = Math.max(amount(taxableTotalIncome) - total, 0);
  const fullBand = Math.min(Math.max(10_000_000 - baseWithoutDividend, 0), total);
  const corpFull = (corp * fullBand) / total;
  const trustFull = (trust * fullBand) / total;
  return floorYen(
    corpFull * 0.1 + trustFull * 0.05 + (corp - corpFull) * 0.05 + (trust - trustFull) * 0.025,
  );
}

/** 政党等寄附金特別控除:（寄附金 − 2,000円）× 30%、上限は所得税額の25%。 */
export function politicalDonationCredit(donations: number, baseIncomeTax: number): number {
  const raw = floorYen(Math.max(amount(donations) - 2_000, 0) * 0.3);
  return Math.min(raw, floorYen(amount(baseIncomeTax) * 0.25));
}

/** 認定NPO法人等寄附金特別控除:（寄附金 − 2,000円）× 40%、上限は所得税額の25%。 */
export function certifiedNpoDonationCredit(donations: number, baseIncomeTax: number): number {
  const raw = floorYen(Math.max(amount(donations) - 2_000, 0) * 0.4);
  return Math.min(raw, floorYen(amount(baseIncomeTax) * 0.25));
}

/** 住宅耐震改修特別控除: A × 10% + B × 5%（それぞれ100円未満切捨て）。A は250万円が限度。 */
export function seismicRetrofitCredit(standardCost: number, otherCost: number): number {
  const a = Math.min(amount(standardCost), 2_500_000);
  const b = amount(otherCost);
  return floor100(a * 0.1) + floor100(b * 0.05);
}

/**
 * 外国税額控除。控除限度額 = 所得税額 × （調整国外所得金額 ÷ 所得総額）。
 * 所得総額には合計所得金額（所得控除前）を渡すこと。
 */
export function foreignTaxCredit(
  paid: number,
  foreignIncome: number,
  totalIncome: number,
  baseIncomeTax: number,
): number {
  const t = amount(totalIncome);
  if (t <= 0) return 0;
  const limit = floorYen((amount(baseIncomeTax) * amount(foreignIncome)) / t);
  return Math.min(amount(paid), limit);
}

export interface TaxCreditBreakdown {
  housingLoan: number;
  /** 定額減税（令和6年分のみ） */
  flatReduction: number;
  dividend: number;
  politicalDonations: number;
  certifiedNpoDonations: number;
  seismicRetrofit: number;
  foreignTax: number;
  /** 税額控除の合計 */
  total: number;
}

/**
 * 税額控除の内訳と合計を計算する。
 * baseIncomeTax は税額控除前の所得税額（速算表の税額）。
 * taxableIncome は配当控除の判定に使う課税総所得金額等、
 * totalIncome は外国税額控除の限度額計算に使う合計所得金額。
 */
export function computeTaxCredits(
  inputs: TaxCreditInputs,
  baseIncomeTax: number,
  taxableIncome: number,
  totalIncome: number,
): TaxCreditBreakdown {
  const breakdown: TaxCreditBreakdown = {
    housingLoan: housingLoanCredit(
      inputs.housingLoanBalance,
      inputs.housingLoanLimit,
      inputs.housingLoanRate,
    ),
    flatReduction: amount(inputs.flatReduction),
    dividend: dividendCredit(inputs.dividendCorporate, inputs.dividendTrust, taxableIncome),
    politicalDonations: politicalDonationCredit(inputs.politicalDonations, baseIncomeTax),
    certifiedNpoDonations: certifiedNpoDonationCredit(inputs.certifiedNpoDonations, baseIncomeTax),
    seismicRetrofit: seismicRetrofitCredit(
      inputs.seismicRetrofitStandardCost,
      inputs.seismicRetrofitOtherCost,
    ),
    foreignTax: foreignTaxCredit(inputs.foreignTaxPaid, inputs.foreignIncome, totalIncome, baseIncomeTax),
    total: 0,
  };
  breakdown.total =
    breakdown.housingLoan +
    breakdown.flatReduction +
    breakdown.dividend +
    breakdown.politicalDonations +
    breakdown.certifiedNpoDonations +
    breakdown.seismicRetrofit +
    breakdown.foreignTax;
  return breakdown;
}

// ---------------------------------------------------------------------------
// 所得税額（No.2260 の速算表・復興特別所得税・端数処理）
// ---------------------------------------------------------------------------

/** 所得税の速算表: [課税所得の上限, 税率, 控除額] */
export const INCOME_TAX_BRACKETS: { upTo: number; rate: number; deduction: number }[] = [
  { upTo: 1_949_000, rate: 0.05, deduction: 0 },
  { upTo: 3_299_000, rate: 0.1, deduction: 97_500 },
  { upTo: 6_949_000, rate: 0.2, deduction: 427_500 },
  { upTo: 8_999_000, rate: 0.23, deduction: 636_000 },
  { upTo: 17_999_000, rate: 0.33, deduction: 1_536_000 },
  { upTo: 39_999_000, rate: 0.4, deduction: 2_796_000 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.45, deduction: 4_796_000 },
];

/** 課税所得金額（1,000円未満切捨て済み）に対する所得税額（税額控除前）。 */
export function incomeTaxOnTaxableIncome(taxableIncome: number): number {
  const t = amount(taxableIncome);
  if (t <= 0) return 0;
  for (const bracket of INCOME_TAX_BRACKETS) {
    if (t <= bracket.upTo) {
      return Math.max(floorYen(t * bracket.rate - bracket.deduction), 0);
    }
  }
  return 0;
}

/**
 * 雑所得の入力。帳簿（事業・不動産）には載らない所得を申告書へ反映する
 * ための手入力で、第一表の「雑」欄に対応する。3区分を持つ:
 * - 公的年金等（収入金額カ・所得金額⑦）: 所得金額は公的年金等控除を
 *   引いて決定的に計算する（publicPensionIncome）。
 * - 業務（収入金額キ・所得金額⑧）: 副業など営利目的で継続的なもの。
 *   所得金額は収入金額 − 必要経費を手入力する。
 * - その他（収入金額ク・所得金額⑨）: 上記以外の雑所得。所得金額は手入力。
 */
export interface MiscIncomeInput {
  /** その他: 収入金額（第一表ク） */
  revenue: number;
  /** その他: 所得金額（第一表⑨）。収入金額から必要経費を引いた額 */
  income: number;
  /** その他区分（第一表クの区分）。0 は未設定（出力しない） */
  kubun: number;
  /** 公的年金等: 収入金額（第一表カ） */
  pensionRevenue: number;
  /** 公的年金等: その年の12月31日時点で65歳以上か（控除額の年齢区分） */
  pensionOver65: boolean;
  /** 業務: 収入金額（第一表キ） */
  businessRevenue: number;
  /** 業務: 所得金額（第一表⑧）。収入金額から必要経費を引いた額 */
  businessIncome: number;
  /** 業務区分（第一表キの区分。現金主義の特例は 1）。0 は未設定 */
  businessKubun: number;
}

export const EMPTY_MISC_INCOME: MiscIncomeInput = {
  revenue: 0,
  income: 0,
  kubun: 0,
  pensionRevenue: 0,
  pensionOver65: false,
  businessRevenue: 0,
  businessIncome: 0,
  businessKubun: 0,
};

/** 部分的な雑所得入力（API の任意項目など）を完全な入力へ寄せる。 */
export function normalizeMiscIncomeInput(partial: Partial<MiscIncomeInput> | undefined): MiscIncomeInput {
  if (!partial) return { ...EMPTY_MISC_INCOME };
  const num = (v: number | undefined): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);
  return {
    revenue: num(partial.revenue),
    income: num(partial.income),
    kubun: num(partial.kubun),
    pensionRevenue: num(partial.pensionRevenue),
    pensionOver65: partial.pensionOver65 === true,
    businessRevenue: num(partial.businessRevenue),
    businessIncome: num(partial.businessIncome),
    businessKubun: num(partial.businessKubun),
  };
}

/** 部分的な給与所得入力（API の任意項目など）を完全な入力へ寄せる。 */
export function normalizeSalaryIncomeInput(partial: Partial<SalaryIncomeInput> | undefined): SalaryIncomeInput {
  if (!partial) return { ...EMPTY_SALARY_INCOME };
  return {
    revenue:
      typeof partial.revenue === "number" && Number.isFinite(partial.revenue)
        ? Math.trunc(partial.revenue)
        : 0,
    adjustmentEligible: partial.adjustmentEligible === true,
  };
}

/**
 * 給与所得の入力。帳簿（事業・不動産）には載らない給与を申告書へ
 * 反映するための手入力で、第一表の「給与」（オ・⑥）に対応する。
 * 所得金額は給与所得控除と所得金額調整控除を引いて決定的に計算する
 * （computeManualIncomes）。
 */
export interface SalaryIncomeInput {
  /** 給与等の収入金額（源泉徴収票の支払金額） */
  revenue: number;
  /**
   * 所得金額調整控除（子ども・特別障害者等）の対象か。本人が特別障害者、
   * 23歳未満の扶養親族がいる、特別障害者である同一生計配偶者・扶養親族が
   * いる、のいずれかに該当し、かつ給与収入が850万円を超える場合に適用。
   */
  adjustmentEligible?: boolean;
}

export const EMPTY_SALARY_INCOME: SalaryIncomeInput = { revenue: 0 };

/**
 * 給与所得の金額（No.1410 / No.1400）。段階表は年度パラメータ
 * （taxParameters）が持つ。収入金額が660万円未満のときは、所得税法
 * 別表第五の方式（収入金額を4で割って千円未満切捨て→×4した金額を
 * 基準額として表を引き、所得金額 = 基準額 − 控除額）で求める。
 */
export function salaryIncomeAmount(year: number, revenue: number): number {
  const r = amount(revenue);
  if (r <= 0) return 0;
  const tiers = taxParametersFor(year).salaryDeductionTiers;
  const base = r < 6_600_000 ? Math.floor(r / 4000) * 4000 : r;
  for (const tier of tiers) {
    if (base <= tier.upTo) {
      const deduction =
        tier.amount !== undefined
          ? tier.amount
          : Math.floor(base * (tier.rate ?? 0)) + (tier.adjust ?? 0);
      return Math.max(base - deduction, 0);
    }
  }
  return 0;
}

/** 給与所得控除額（収入金額 − 給与所得の金額）。 */
export function salaryDeductionAmount(year: number, revenue: number): number {
  const r = amount(revenue);
  return r - salaryIncomeAmount(year, r);
}

/**
 * 所得金額調整控除（子ども・特別障害者等を有する者等、No.1411）。
 * 給与等の収入金額が850万円を超え、対象者（特別障害者本人／23歳未満の
 * 扶養親族あり／特別障害者である同一生計配偶者・扶養親族あり）の場合に、
 * 給与所得の金額から控除する。
 * 控除額 = { min(収入金額, 1,000万円) − 850万円 } × 10%（1円未満切上げ）。
 */
export function salaryAdjustmentDeduction1(revenue: number, eligible: boolean): number {
  const r = amount(revenue);
  if (!eligible || r <= 8_500_000) return 0;
  return Math.ceil((Math.min(r, 10_000_000) - 8_500_000) * 0.1);
}

/**
 * 所得金額調整控除（給与所得と年金所得の両方を有する者、No.1411）。
 * 給与所得（調整控除①適用後）と公的年金等雑所得の両方があり、合計が
 * 10万円を超える場合に、給与所得の金額から控除する。
 * 控除額 = min(給与所得, 10万円) + min(年金雑所得, 10万円) − 10万円。
 */
export function salaryAdjustmentDeduction2(salaryIncomeAfterAdj1: number, pensionIncome: number): number {
  const s = amount(salaryIncomeAfterAdj1);
  const p = amount(pensionIncome);
  if (s <= 0 || p <= 0 || s + p <= 100_000) return 0;
  return Math.min(s, 100_000) + Math.min(p, 100_000) - 100_000;
}

/**
 * 公的年金等控除額（No.1600 の速算表・令和2年分以後）。
 * 「公的年金等に係る雑所得以外の合計所得金額」が1,000万円以下の区分を
 * 基準に、1,000万円超2,000万円以下では一律10万円、2,000万円超では
 * 一律20万円、控除額が縮小する。
 */
export function publicPensionDeduction(revenue: number, over65: boolean, otherTotalIncome: number): number {
  const a = amount(revenue);
  if (a <= 0) return 0;
  let deduction: number;
  if (over65) {
    if (a <= 1_100_000) deduction = a;
    else if (a < 3_300_000) deduction = 1_100_000;
    else if (a < 4_100_000) deduction = a * 0.25 + 275_000;
    else if (a < 7_700_000) deduction = a * 0.15 + 685_000;
    else if (a < 10_000_000) deduction = a * 0.05 + 1_455_000;
    else deduction = 1_955_000;
  } else {
    if (a <= 600_000) deduction = a;
    else if (a < 1_300_000) deduction = 600_000;
    else if (a < 4_100_000) deduction = a * 0.25 + 275_000;
    else if (a < 7_700_000) deduction = a * 0.15 + 685_000;
    else if (a < 10_000_000) deduction = a * 0.05 + 1_455_000;
    else deduction = 1_955_000;
  }
  const other = amount(otherTotalIncome);
  if (other > 20_000_000) deduction -= 200_000;
  else if (other > 10_000_000) deduction -= 100_000;
  // 控除額は収入金額を超えず、マイナスにもならない
  return Math.min(Math.max(Math.floor(deduction), 0), a);
}

/** 公的年金等に係る雑所得の金額（収入金額 − 公的年金等控除額、0未満は0）。 */
export function publicPensionIncome(revenue: number, over65: boolean, otherTotalIncome: number): number {
  const a = amount(revenue);
  if (a <= 0) return 0;
  return Math.max(a - publicPensionDeduction(a, over65, otherTotalIncome), 0);
}

/** 手入力所得（給与＋雑3区分）の計算内訳。 */
export interface ManualIncomeBreakdown {
  /** 給与所得の金額（給与所得控除後・調整控除前） */
  salaryBase: number;
  /** 所得金額調整控除（子ども・特別障害者等） */
  salaryAdjustment1: number;
  /** 所得金額調整控除（給与＋年金） */
  salaryAdjustment2: number;
  /** 給与所得の金額（第一表⑥、調整控除適用後） */
  salary: number;
  /** 公的年金等に係る雑所得（第一表⑦） */
  pension: number;
  /** 業務に係る雑所得（第一表⑧） */
  miscBusiness: number;
  /** その他の雑所得（第一表⑨） */
  miscOther: number;
  /** 雑所得の計（第一表⑩ = ⑦+⑧+⑨） */
  miscTotal: number;
  /** 手入力所得の合計（給与＋雑計）。帳簿の事業・不動産は含まない */
  total: number;
}

/**
 * 給与・雑所得の最終金額を決定的に計算する。
 * 公的年金等控除の区分は「公的年金等以外の合計所得金額」で決まるため、
 * 帳簿側の所得合計（事業＋不動産）を引数で受ける。調整控除②が給与所得を
 * 減らすと区分が動き得るため、年金所得と調整控除②は安定するまで
 * 繰り返して確定させる（区分境界は1,000万円/2,000万円、調整控除②は
 * 最大10万円なので数回で必ず安定する）。
 */
export function computeManualIncomes(
  year: number,
  salaryInput: SalaryIncomeInput,
  miscInput: MiscIncomeInput,
  ledgerIncomeTotal: number,
): ManualIncomeBreakdown {
  const salaryBase = salaryIncomeAmount(year, salaryInput.revenue);
  const adjustment1 = salaryAdjustmentDeduction1(
    salaryInput.revenue,
    salaryInput.adjustmentEligible === true,
  );
  const salaryAfterAdj1 = Math.max(salaryBase - adjustment1, 0);
  const miscBusiness = amount(miscInput.businessIncome);
  const miscOther = amount(miscInput.income);
  const ledger = amount(ledgerIncomeTotal);

  let pension = 0;
  let adjustment2 = 0;
  for (let i = 0; i < 4; i++) {
    const otherTotal = ledger + salaryAfterAdj1 - adjustment2 + miscBusiness + miscOther;
    const nextPension = publicPensionIncome(miscInput.pensionRevenue, miscInput.pensionOver65, otherTotal);
    const nextAdjustment2 = salaryAdjustmentDeduction2(salaryAfterAdj1, nextPension);
    if (nextPension === pension && nextAdjustment2 === adjustment2) {
      pension = nextPension;
      adjustment2 = nextAdjustment2;
      break;
    }
    pension = nextPension;
    adjustment2 = nextAdjustment2;
  }
  const salary = Math.max(salaryAfterAdj1 - adjustment2, 0);
  const miscTotal = pension + miscBusiness + miscOther;
  return {
    salaryBase,
    salaryAdjustment1: adjustment1,
    salaryAdjustment2: adjustment2,
    salary,
    pension,
    miscBusiness,
    miscOther,
    miscTotal,
    total: salary + miscTotal,
  };
}

export interface IncomeTaxOptions {
  year: number;
  /** 合計所得金額（青色申告特別控除後・所得控除前） */
  totalIncome: number;
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
}

export interface IncomeTaxResult {
  year: number;
  totalIncome: number;
  deductions: IncomeDeductionBreakdown;
  /** 所得控除の合計 */
  deductionsTotal: number;
  /** 課税所得金額（1,000円未満切捨て後） */
  taxableIncome: number;
  /** 所得税額（税額控除前） */
  incomeTaxBase: number;
  taxCredits: TaxCreditBreakdown;
  /** 税額控除の合計 */
  taxCreditsTotal: number;
  /** 復興特別所得税（税額控除後の所得税額 × 2.1%、円未満切捨て） */
  reconstructionTax: number;
  /** 確定税額（100円未満切捨て）。修正申告の income_tax に使える金額 */
  finalTax: number;
}

/**
 * 所得税額の全計算: 所得控除 → 課税所得 → 速算表 → 税額控除 →
 * 復興特別所得税 → 確定税額（100円未満切捨て）。
 * 源泉徴収税額・予定納税の精算は含まない（申告納税額とは別に扱うこと）。
 */
export function computeIncomeTax(options: IncomeTaxOptions): IncomeTaxResult {
  const year = Math.trunc(options.year || 0);
  const totalIncome = amount(options.totalIncome);
  const deductions = computeIncomeDeductions(year, totalIncome, options.deductions);
  const taxableRaw = Math.max(totalIncome - deductions.total, 0);
  const taxableIncome = Math.floor(taxableRaw / 1000) * 1000;
  const incomeTaxBase = incomeTaxOnTaxableIncome(taxableIncome);
  const taxCredits = computeTaxCredits(options.taxCredits, incomeTaxBase, taxableIncome, totalIncome);
  const afterCredits = Math.max(incomeTaxBase - taxCredits.total, 0);
  const reconstructionTax = floorYen(afterCredits * 0.021);
  const finalTax = floor100(afterCredits + reconstructionTax);
  return {
    year,
    totalIncome,
    deductions,
    deductionsTotal: deductions.total,
    taxableIncome,
    incomeTaxBase,
    taxCredits,
    taxCreditsTotal: taxCredits.total,
    reconstructionTax,
    finalTax,
  };
}
