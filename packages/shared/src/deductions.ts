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
 *   基準所得税額（外国税額控除を適用しないで計算した所得税額）× 2.1%
 *   （円未満切捨て）。
 *
 * 前提・簡略化（呼び出し側の責任範囲）:
 * - 合計所得金額は「青色申告特別控除後の所得の合計」を呼び出し側が渡す。
 * - 配偶者控除・扶養控除・障害者控除などは、対象者の合計所得が要件以下で
 *   あることを呼び出し側（入力UI）が確認し、区分・人数だけを渡す。
 *   ただし配偶者特別控除と特定親族特別控除は、対象者の合計所得金額で
 *   控除額が段階的に変わるため、その金額自体を入力として段階表を適用する。
 * - 寡婦控除とひとり親控除は併用できない（計算側でひとり親を優先する）。
 *   寡婦・ひとり親は合計所得金額500万円以下、勤労学生は年度パラメータの
 *   上限以下が所得要件で、計算側でも判定する。
 * - 医療費控除とセルフメディケーション税制は選択制。本モジュールは
 *   通常の医療費控除のみを計算する。
 */
import { lookupTier, taxParametersFor } from "./taxParameters";
import { separateTaxAmount } from "./expandedIncome";

/** 円未満を切り捨てる。浮動小数の誤差吸収つき。 */
function floorYen(x: number): number {
  return Math.floor(x + 1e-9);
}

/** 100円未満を切り捨てる（住宅借入金等特別控除・確定税額などの端数処理）。 */
function floor100(x: number): number {
  return Math.floor((x + 1e-9) / 100) * 100;
}

/** 金額・人数の入力を非負の整数に正規化する。 */
function amount(x: number): number {
  const n = Math.trunc(x || 0);
  return n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// 基礎控除（No.1199）
// ---------------------------------------------------------------------------

/**
 * 基礎控除。合計所得金額と年分で決まる。年度ごとの段階表は
 * taxParameters（TAX_PARAMETERS）が持ち、ここでは引いて適用するだけ（No.1199）。
 * - 令和5・6年分: 48万円（2,400万円超で逓減、2,500万円超は0）
 * - 令和7年分: 本則58万円＋上乗せ特例（132万円以下は95万円）
 * - 令和8・9年分: 本則62万円＋上乗せ特例（489万円以下は104万円）
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
 * 配偶者の合計所得が要件（年度パラメータの spouseIncomeLimit 以下）を満たす
 * ことは呼び出し側の前提。computeIncomeDeductions は配偶者の合計所得が
 * 入力されていればそれで判定する。
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
 * （年度パラメータの spouseIncomeLimit）を超え133万円以下のときに
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
    amount(counts.general) * 380_000 +
    amount(counts.specific) * 630_000 +
    amount(counts.elderly) * 480_000 +
    amount(counts.elderlyCohabiting) * 580_000
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
    amount(counts.general) * 270_000 +
    amount(counts.special) * 400_000 +
    amount(counts.specialCohabiting) * 750_000
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

/** 生命保険料控除の新契約の区分ごとの上限（本則）。 */
const LIFE_INSURANCE_NEW_CAP = 40_000;

/**
 * 新契約（平成24年1月1日以後締結）の計算式。区分ごとの上限は cap（本則 40,000円）で、
 * 段の境は上限の 1/2・1倍・2倍（上限 60,000円の特例では 3万・6万・12万円）。
 */
export function lifeInsuranceNewFormula(premium: number, cap = LIFE_INSURANCE_NEW_CAP): number {
  const p = amount(premium);
  if (p <= cap / 2) return p;
  if (p <= cap) return Math.floor(p / 2) + cap / 4;
  if (p <= cap * 2) return Math.floor(p / 4) + cap / 2;
  return cap;
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
 * 新旧両方の契約がある区分（一般・個人年金）の控除額。新契約のみ・旧契約のみ・
 * 新旧の合計（上限は新契約の上限 newCap）のうち大きい方とする（国税庁 No.1140 の
 * 「新契約と旧契約の双方に加入している場合」。本則では旧契約の支払保険料が
 * 60,000円を超えると旧契約のみ、以下なら新旧の合計が大きくなる）。
 */
function lifeInsuranceCategoryDeduction(
  newPremium: number,
  oldPremium: number,
  newCap = LIFE_INSURANCE_NEW_CAP,
): number {
  const n = amount(newPremium);
  const o = amount(oldPremium);
  const newOnly = lifeInsuranceNewFormula(n, newCap);
  if (o <= 0) return newOnly;
  const oldOnly = lifeInsuranceOldFormula(o);
  if (n <= 0) return oldOnly;
  return Math.max(newOnly, oldOnly, Math.min(newOnly + oldOnly, newCap));
}

/**
 * 生命保険料控除。全体の上限は120,000円。generalNewCap は一般生命保険料
 * （新契約）の区分の上限（23歳未満の扶養親族がいる年分の特例では 60,000円）。
 */
export function lifeInsuranceDeduction(
  premiums: LifeInsurancePremiums,
  generalNewCap = LIFE_INSURANCE_NEW_CAP,
): number {
  const total =
    lifeInsuranceCategoryDeduction(premiums.newGeneral, premiums.oldGeneral, generalNewCap) +
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
 *   (2)（災害関連支出 − 補填金のうち損害金額を超える部分）− 50,000円
 * 算式(2)で差し引く補填金は、まず損害金額から差し引き、損害金額を
 * 超える部分だけが対象になる（国税庁 No.1110 の注記）。
 */
export function casualtyLossDeduction(input: CasualtyLossInput, totalIncome: number): number {
  const damage = amount(input.damageAmount);
  const disaster = amount(input.disasterRelatedExpenses);
  const other = amount(input.otherRelatedExpenses);
  const comp = amount(input.compensation);
  const a = damage + disaster + other - comp - Math.floor(amount(totalIncome) * 0.1);
  const excessCompensation = Math.max(comp - damage, 0);
  const b = disaster - excessCompensation - 50_000;
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
  /** 23歳未満の扶養親族がいるか（生命保険料控除の特例の判定。未指定は false） */
  hasDependentUnder23?: boolean;
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
  hasDependentUnder23: false,
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

/**
 * 所得控除の内訳と合計を計算する。基礎控除は合計所得金額から自動で決まる。
 * grandTotalIncome（総合＋申告分離の所得金額）を渡すと、所得要件・足切りの
 * 判定はすべてそちらで行う。基礎控除・配偶者（特別）控除・寡婦・ひとり親・
 * 勤労学生は合計所得金額、医療費控除の足切り・寄附金控除の40%上限・雑損控除の
 * 10%は総所得金額等が基準で、どちらも申告分離課税の所得を含む（繰越控除は
 * 扱わないため両者は同額）。省略時は totalIncome と同じ。
 */
export function computeIncomeDeductions(
  year: number,
  totalIncome: number,
  inputs: DeductionInputs,
  grandTotalIncome?: number,
): IncomeDeductionBreakdown {
  const t = amount(totalIncome);
  const tg = grandTotalIncome !== undefined ? amount(grandTotalIncome) : t;
  const params = taxParametersFor(year);
  // 寡婦・ひとり親は合計所得金額が年度パラメータの上限以下が要件。両方に該当する
  // 場合はひとり親控除が優先し、寡婦控除は適用しない（排他）。
  const withinSingleParentLimit = tg <= params.singleParentWidowIncomeLimit;
  const singleParent =
    inputs.isSingleParent && withinSingleParentLimit ? params.singleParentDeduction : 0;
  const widow =
    inputs.isWidow && !inputs.isSingleParent && withinSingleParentLimit ? params.widowDeduction : 0;
  // 勤労学生は合計所得金額が年度パラメータの上限以下が要件
  const workingStudent =
    inputs.isWorkingStudent && tg <= params.workingStudentLimit ? 270_000 : 0;
  const lifeInsuranceGeneralCap =
    inputs.hasDependentUnder23 === true && params.lifeInsuranceGeneralYoungDependentCap !== null
      ? params.lifeInsuranceGeneralYoungDependentCap
      : undefined;
  // 配偶者の合計所得が入力されていて要件を超えるなら、配偶者控除ではなく
  // 配偶者特別控除の側（両者は併用できない）
  const spouseOverLimit =
    inputs.spouseTotalIncome !== null &&
    amount(inputs.spouseTotalIncome) > params.spouseIncomeLimit;
  const breakdown: IncomeDeductionBreakdown = {
    casualtyLoss: inputs.casualtyLoss ? casualtyLossDeduction(inputs.casualtyLoss, tg) : 0,
    medical: medicalDeduction(inputs.medicalExpensesPaid, inputs.medicalReimbursement, tg),
    socialInsurance: amount(inputs.socialInsurancePaid),
    smallBusinessMutualAid: amount(inputs.smallBusinessMutualAidPaid),
    lifeInsurance: lifeInsuranceDeduction(inputs.lifeInsurance, lifeInsuranceGeneralCap),
    earthquakeInsurance: earthquakeInsuranceDeduction(inputs.earthquakeInsurance),
    donations: donationDeduction(inputs.donationsTotal, tg),
    disability: disabilityDeduction(inputs.disability),
    widow,
    singleParent,
    workingStudent,
    spouse: spouseOverLimit ? 0 : spouseDeduction(inputs.spouseCategory, tg),
    spouseSpecial: spouseSpecialDeduction(year, inputs.spouseTotalIncome, tg),
    dependents: dependentDeduction(inputs.dependents),
    specialRelative: specialRelativeDeduction(year, inputs.specialRelativeTotalIncome),
    basic: basicDeduction(year, tg),
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
  /** 定額減税額（本人と同一生計配偶者・扶養親族の人数 × ¥30,000）。対象年分以外は控除しない */
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
 * 1,000万円の枠への充当順は「配当以外の所得 → 剰余金配当等 →
 * 証券投資信託の収益の分配」（作成コーナーの計算式）。
 * taxableTotalIncome は配当所得を含む課税総所得金額等。
 */
export function dividendCredit(
  dividendCorporate: number,
  dividendTrust: number,
  taxableTotalIncome: number,
): number {
  const corp = amount(dividendCorporate);
  const trust = amount(dividendTrust);
  if (corp + trust <= 0) return 0;
  const baseWithoutDividend = Math.max(amount(taxableTotalIncome) - corp - trust, 0);
  let band = Math.max(10_000_000 - baseWithoutDividend, 0);
  const corpFull = Math.min(corp, band);
  band -= corpFull;
  const trustFull = Math.min(trust, band);
  // 率は 10% / 5% / 5% / 2.5% — 1,000 分率の整数演算で求める
  const numerator =
    corpFull * 100 + trustFull * 50 + (corp - corpFull) * 50 + (trust - trustFull) * 25;
  return Math.floor(numerator / 1000);
}

/**
 * 寄附金の税額控除の対象額。総所得金額等の40%の上限と2,000円の足切りは、
 * 寄附金控除（所得控除）と各特別控除の寄附金の合計で1回だけかかるため、
 * 先に使った寄附金の額（priorDonations）を差し引いた残りで判定する。
 */
function donationCreditBase(donations: number, totalIncome: number, priorDonations: number): number {
  const prior = amount(priorDonations);
  const capRemaining = Math.max(Math.floor(amount(totalIncome) * 0.4) - prior, 0);
  const eligible = Math.min(amount(donations), capRemaining);
  const thresholdRemaining = Math.max(2_000 - prior, 0);
  return Math.max(eligible - thresholdRemaining, 0);
}

/**
 * 政党等寄附金特別控除:（対象寄附金 − 2,000円）× 30%（100円未満切捨て）。
 * 対象寄附金は総所得金額等の40%が上限。priorDonations は寄附金控除の対象に
 * した寄附金の額（40%と2,000円の枠を先に使う）。所得税額の25%上限は
 * computeTaxCredits 側で処理する。
 */
export function politicalDonationCredit(
  donations: number,
  totalIncome: number,
  priorDonations = 0,
): number {
  return Math.floor((donationCreditBase(donations, totalIncome, priorDonations) * 3) / 1000) * 100;
}

/**
 * 認定NPO法人等寄附金特別控除:（対象寄附金 − 2,000円）× 40%
 * （100円未満切捨て）。対象寄附金は総所得金額等の40%が上限。priorDonations は
 * 寄附金控除・政党等寄附金特別控除の対象にした寄附金の額。所得税額の25%上限は
 * computeTaxCredits 側で処理する。
 */
export function certifiedNpoDonationCredit(
  donations: number,
  totalIncome: number,
  priorDonations = 0,
): number {
  return Math.floor((donationCreditBase(donations, totalIncome, priorDonations) * 4) / 1000) * 100;
}

/**
 * 住宅耐震改修特別控除: A × 10% + B × 5%（それぞれ100円未満切捨て）。
 * A（標準的な費用の額）は250万円が限度、A + B の合計は1,000万円が限度。
 */
export function seismicRetrofitCredit(standardCost: number, otherCost: number): number {
  const standardRaw = amount(standardCost);
  const a = Math.min(standardRaw, 2_500_000);
  const b = Math.min(amount(otherCost), Math.max(10_000_000 - standardRaw, 0));
  return floor100(a * 0.1) + floor100(b * 0.05);
}

/** 外国税額控除の内訳（所得税分・復興特別所得税分）。 */
export interface ForeignTaxCreditSplit {
  /** 所得税からの控除分 */
  incomePart: number;
  /** 復興特別所得税からの控除分 */
  reconstructionPart: number;
  /** 合計 */
  total: number;
}

/**
 * 外国税額控除（外国税額控除に関する明細書の計算）。所得総額には合計所得金額
 * （所得控除前）を渡すこと。
 * - incomeTax（A）: 所得税の控除限度額の基になる所得税額。外国税額控除と
 *   定額減税以外の税額控除を引いた後の額（再差引所得税額）。
 * - standardIncomeTax（B）: 基準所得税額。外国税額控除を適用しないで計算した
 *   所得税額で、定額減税がある年分はその控除後の額。省略時は A と同じ。
 * 手順:
 *   所得税控除限度額 = A ×（調整国外所得金額 ÷ 所得総額）（円未満切捨て）
 *   所得税分 = min(外国所得税額, 所得税控除限度額）
 *   復興特別所得税（控除前）R = B × 2.1%（円未満切捨て）
 *   復興税控除限度額 = R ×（調整国外所得金額 ÷ 所得総額）（円未満切捨て）
 *   復興税分 = min(外国所得税額 − 所得税分， 復興税控除限度額）
 */
export function foreignTaxCredit(
  paid: number,
  foreignIncome: number,
  totalIncome: number,
  incomeTax: number,
  standardIncomeTax: number = incomeTax,
): ForeignTaxCreditSplit {
  const p = amount(paid);
  const t = amount(totalIncome);
  if (p <= 0 || t <= 0) return { incomePart: 0, reconstructionPart: 0, total: 0 };
  const a = amount(incomeTax);
  const foreign = Math.min(amount(foreignIncome), t);
  const incomeLimit = Math.floor((a * foreign) / t);
  const incomePart = Math.min(p, incomeLimit);
  const reconstructionGross = Math.floor((amount(standardIncomeTax) * 21) / 1000);
  const reconstructionLimit = Math.floor((reconstructionGross * foreign) / t);
  const reconstructionPart = Math.min(p - incomePart, reconstructionLimit);
  return { incomePart, reconstructionPart, total: incomePart + reconstructionPart };
}

export interface TaxCreditBreakdown {
  housingLoan: number;
  /** 定額減税（対象年分以外は 0） */
  flatReduction: number;
  dividend: number;
  politicalDonations: number;
  certifiedNpoDonations: number;
  seismicRetrofit: number;
  /** 外国税額控除の合計（所得税分＋復興特別所得税分） */
  foreignTax: number;
  /** 外国税額控除のうち所得税分 */
  foreignTaxIncomePart: number;
  /** 外国税額控除のうち復興特別所得税分 */
  foreignTaxReconstructionPart: number;
  /** 税額控除の合計 */
  total: number;
}

/**
 * 税額控除の内訳と合計を計算する。
 * baseIncomeTax は税額控除前の所得税額（速算表の税額）。
 * taxableIncome は配当控除の判定に使う課税総所得金額等、
 * totalIncome は寄附金の40%上限と外国税額控除の所得総額に使う、申告分離
 * 課税の所得を含む合計所得金額。
 * 外国税額控除の所得税分の限度額は再差引所得税額（定額減税・外国税額控除
 * 以外の税額控除を引いた後）を、復興税分の限度額は基準所得税額（さらに
 * 定額減税を引いた後）の2.1%を基に按分する。
 * year を渡すと、定額減税は年度パラメータで対象年分の場合だけ控除する。
 * incomeDeductionDonations は寄附金控除（所得控除）の対象にした寄附金の額。
 */
export function computeTaxCredits(
  inputs: TaxCreditInputs,
  baseIncomeTax: number,
  taxableIncome: number,
  totalIncome: number,
  year?: number,
  incomeDeductionDonations = 0,
): TaxCreditBreakdown {
  const housingLoan = housingLoanCredit(
    inputs.housingLoanBalance,
    inputs.housingLoanLimit,
    inputs.housingLoanRate,
  );
  const flatReductionApplies =
    year === undefined || taxParametersFor(year).flatReductionApplies;
  const flatReduction = flatReductionApplies ? amount(inputs.flatReduction) : 0;
  const dividend = dividendCredit(inputs.dividendCorporate, inputs.dividendTrust, taxableIncome);
  // 40%の上限と2,000円の足切りは 寄附金控除 → 政党等 → 認定NPO等 の順に使う。
  // 所得税額の25%の上限は、政党等と認定NPO等（公益社団法人等を含む）にそれぞれかかる
  // （No.1260・No.1263）。
  const deductionDonations = Math.min(
    amount(incomeDeductionDonations),
    Math.floor(amount(totalIncome) * 0.4),
  );
  const politicalEligible = Math.min(
    amount(inputs.politicalDonations),
    Math.max(Math.floor(amount(totalIncome) * 0.4) - deductionDonations, 0),
  );
  const donationCreditCap = floor100(amount(baseIncomeTax) * 0.25);
  const politicalDonations = Math.min(
    politicalDonationCredit(inputs.politicalDonations, totalIncome, deductionDonations),
    donationCreditCap,
  );
  const certifiedNpoDonations = Math.min(
    certifiedNpoDonationCredit(
      inputs.certifiedNpoDonations,
      totalIncome,
      deductionDonations + politicalEligible,
    ),
    donationCreditCap,
  );
  const seismicRetrofit = seismicRetrofitCredit(
    inputs.seismicRetrofitStandardCost,
    inputs.seismicRetrofitOtherCost,
  );
  const creditsBeforeFlatReduction =
    housingLoan + dividend + politicalDonations + certifiedNpoDonations + seismicRetrofit;
  const othersTotal = creditsBeforeFlatReduction + flatReduction;
  const reSubtractedIncomeTax = Math.max(amount(baseIncomeTax) - creditsBeforeFlatReduction, 0);
  const foreign = foreignTaxCredit(
    inputs.foreignTaxPaid,
    inputs.foreignIncome,
    totalIncome,
    reSubtractedIncomeTax,
    Math.max(reSubtractedIncomeTax - flatReduction, 0),
  );
  return {
    housingLoan,
    flatReduction,
    dividend,
    politicalDonations,
    certifiedNpoDonations,
    seismicRetrofit,
    foreignTax: foreign.total,
    foreignTaxIncomePart: foreign.incomePart,
    foreignTaxReconstructionPart: foreign.reconstructionPart,
    total: othersTotal + foreign.total,
  };
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
 * （taxParameters）が持つ。所得税法別表第五の方式:
 * - 収入金額が salaryIncomeZeroBelow 未満なら 0。
 * - 定額控除帯の上端付近の固定額の段（salaryIncomeFixedBands）に入れば
 *   その金額。
 * - それ以外の最低保障帯（第一帯）では端数整理をせず、所得金額 = 収入金額 −
 *   控除額（定額）をそのまま使う（例: 令和7年分・収入1,899,999円 →
 *   所得 1,249,999円）。
 * - 率方式の帯で収入金額が660万円未満のときは、収入金額を4で割って
 *   千円未満切捨て→×4した金額を基準額として表を引き、
 *   所得金額 = 基準額 − 控除額 で求める。
 */
export function salaryIncomeAmount(year: number, revenue: number): number {
  const r = amount(revenue);
  const params = taxParametersFor(year);
  if (r < params.salaryIncomeZeroBelow) return 0;
  const band = params.salaryIncomeFixedBands.find((b) => r >= b.from && r < b.upTo);
  if (band) return band.income;
  const tiers = params.salaryDeductionTiers;
  const first = tiers[0];
  if (first && first.amount !== undefined && r < first.upTo) {
    return Math.max(r - first.amount, 0);
  }
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
 * 最低帯は定額（65歳以上 110万円 / 65歳未満 60万円）であり、収入金額
 * そのものではない。順序は: 速算表の控除額を求め → 「公的年金等に係る
 * 雑所得以外の合計所得金額」が1,000万円超で10万円、2,000万円超で
 * 20万円を差し引き → 0でフロア → 最後に収入金額でキャップする。
 * （例: 65歳以上・年金95万円・他所得1,500万円 → 控除 110万−10万 =
 * 100万円を収入95万円でキャップし、年金所得は 0。）
 */
export function publicPensionDeduction(revenue: number, over65: boolean, otherTotalIncome: number): number {
  const a = amount(revenue);
  if (a <= 0) return 0;
  let deduction: number;
  if (over65) {
    if (a < 3_300_000) deduction = 1_100_000;
    else if (a < 4_100_000) deduction = Math.floor((a * 25) / 100) + 275_000;
    else if (a < 7_700_000) deduction = Math.floor((a * 15) / 100) + 685_000;
    else if (a < 10_000_000) deduction = Math.floor((a * 5) / 100) + 1_455_000;
    else deduction = 1_955_000;
  } else {
    if (a < 1_300_000) deduction = 600_000;
    else if (a < 4_100_000) deduction = Math.floor((a * 25) / 100) + 275_000;
    else if (a < 7_700_000) deduction = Math.floor((a * 15) / 100) + 685_000;
    else if (a < 10_000_000) deduction = Math.floor((a * 5) / 100) + 1_455_000;
    else deduction = 1_955_000;
  }
  const other = amount(otherTotalIncome);
  if (other > 20_000_000) deduction -= 200_000;
  else if (other > 10_000_000) deduction -= 100_000;
  // 他所得区分による縮小を引いた後に 0 でフロアし、収入金額でキャップする
  return Math.min(Math.max(deduction, 0), a);
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
  /** 雑所得の計（第一表⑩ = ⑦+⑧+⑨。赤字は 0） */
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
  // 雑所得（業務・その他）の行は赤字もあり得るため符号つきで持つ。赤字は
  // 雑所得の中（公的年金等）とだけ通算し、他の所得とは通算しない（所得税法69条）。
  const signed = (x: number): number => (Number.isFinite(x) ? Math.trunc(x) : 0);
  const miscBusiness = signed(miscInput.businessIncome);
  const miscOther = signed(miscInput.income);
  const miscNonPension = Math.max(miscBusiness + miscOther, 0);
  const ledger = amount(ledgerIncomeTotal);

  let pension = 0;
  let adjustment2 = 0;
  for (let i = 0; i < 100; i++) {
    const otherTotal = ledger + salaryAfterAdj1 - adjustment2 + miscNonPension;
    const nextPension = publicPensionIncome(miscInput.pensionRevenue, miscInput.pensionOver65, otherTotal);
    const nextAdjustment2 = salaryAdjustmentDeduction2(salaryAfterAdj1, nextPension);
    if (nextPension === pension && nextAdjustment2 === adjustment2) break;
    pension = nextPension;
    adjustment2 = nextAdjustment2;
  }
  // 最終整合: 確定した年金所得に対して調整控除②を再計算し、年金所得の
  // 判定に使った他の所得の合計と矛盾しない形にそろえる
  adjustment2 = salaryAdjustmentDeduction2(salaryAfterAdj1, pension);
  const salary = Math.max(salaryAfterAdj1 - adjustment2, 0);
  const miscTotal = Math.max(pension + miscBusiness + miscOther, 0);
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

/**
 * 申告分離課税の所得。金額は損益通算後・
 * 所得控除の配分前で、いずれも0以上。所得控除は総合課税分から先に
 * 差し引き、引き切れない分を株式等→上場配当の順に配分する
 * （分離課税への控除配分順のうち本スコープの区分）。
 */
export interface SeparateTaxationAmounts {
  /** 株式等に係る譲渡所得等（一般＋上場の黒字分） */
  stockIncome: number;
  /** 上場株式等の配当等（申告分離選択分） */
  dividendIncome: number;
}

export interface IncomeTaxOptions {
  year: number;
  /** 合計所得金額のうち総合課税分（青色申告特別控除後・所得控除前） */
  totalIncome: number;
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
  /** 申告分離課税の所得。省略時は分離課税なし */
  separateTaxation?: SeparateTaxationAmounts;
}

export interface IncomeTaxResult {
  year: number;
  /** 総合課税分の合計所得金額（分離課税分は含まない） */
  totalIncome: number;
  /** 合計所得金額（総合課税分＋申告分離分） */
  grandTotalIncome: number;
  deductions: IncomeDeductionBreakdown;
  /** 所得控除の合計 */
  deductionsTotal: number;
  /** 課税総所得金額（総合課税分、1,000円未満切捨て後） */
  taxableIncome: number;
  /** 課税株式等譲渡所得金額（申告分離、控除配分後・1,000円未満切捨て後） */
  taxableSeparateStocks: number;
  /** 課税上場株式等の配当等の金額（申告分離、控除配分後・1,000円未満切捨て後） */
  taxableSeparateDividends: number;
  /** 所得税額（税額控除前、総合課税分＋申告分離分の合計） */
  incomeTaxBase: number;
  /** 所得税額のうち総合課税分（速算表） */
  incomeTaxComprehensive: number;
  /** 所得税額のうち株式等譲渡の申告分離分（15%） */
  incomeTaxSeparateStocks: number;
  /** 所得税額のうち上場配当の申告分離分（15%） */
  incomeTaxSeparateDividends: number;
  /** 所得税額のうち申告分離分の合計 */
  incomeTaxSeparateTotal: number;
  taxCredits: TaxCreditBreakdown;
  /** 税額控除の合計 */
  taxCreditsTotal: number;
  /** 差引所得税額（外国税額控除以外の税額控除を引いた後の所得税額） */
  taxAfterOtherCredits: number;
  /**
   * 基準所得税額。外国税額控除を適用しないで計算した所得税額
   * （定額減税がある年分はその控除後）で、差引所得税額と同額。
   */
  standardIncomeTax: number;
  /** 復興特別所得税（外国税額控除前）= 基準所得税額 × 2.1%（円未満切捨て） */
  reconstructionTaxGross: number;
  /** 復興特別所得税（外国税額控除の復興税分を引いた後） */
  reconstructionTax: number;
  /** 所得税額（基準所得税額 − 外国税額控除の所得税分。0未満は0） */
  incomeTaxAfterForeignCredit: number;
  /**
   * 確定税額 =（所得税額 ＋ 復興特別所得税額）の100円未満切捨て。
   * 源泉徴収税額が0のときの申告納税額で、修正申告の income_tax に使える金額
   */
  finalTax: number;
}

/**
 * 所得税額の全計算: 所得控除 → 課税所得 → 速算表 → 税額控除 →
 * 復興特別所得税 → 確定税額（100円未満切捨て）。
 * 基準所得税額は外国税額控除を適用しないで計算した所得税額で、復興特別
 * 所得税はその2.1%。外国税額控除は所得税分を所得税額から、復興税分を
 * 復興特別所得税額から差し引く。
 * 源泉徴収税額・予定納税の精算は含まない（申告納税額とは別に扱うこと）。
 */
export function computeIncomeTax(options: IncomeTaxOptions): IncomeTaxResult {
  const year = Math.trunc(options.year || 0);
  const totalIncome = amount(options.totalIncome);
  const separateStocks = amount(options.separateTaxation?.stockIncome ?? 0);
  const separateDividends = amount(options.separateTaxation?.dividendIncome ?? 0);
  const grandTotalIncome = totalIncome + separateStocks + separateDividends;
  const deductions = computeIncomeDeductions(year, totalIncome, options.deductions, grandTotalIncome);
  const taxableRaw = Math.max(totalIncome - deductions.total, 0);
  const taxableIncome = Math.floor(taxableRaw / 1000) * 1000;
  // 所得控除の配分: 総合課税分で引き切れなかった分は、株式等→上場配当の
  // 順に申告分離課税の所得から差し引く。各区分の課税所得金額は
  // 1,000円未満を切り捨てる。
  let excessDeductions = Math.max(deductions.total - totalIncome, 0);
  const stocksAfterDeductions = Math.max(separateStocks - excessDeductions, 0);
  excessDeductions = Math.max(excessDeductions - separateStocks, 0);
  const dividendsAfterDeductions = Math.max(separateDividends - excessDeductions, 0);
  const taxableSeparateStocks = Math.floor(stocksAfterDeductions / 1000) * 1000;
  const taxableSeparateDividends = Math.floor(dividendsAfterDeductions / 1000) * 1000;
  const incomeTaxComprehensive = incomeTaxOnTaxableIncome(taxableIncome);
  const incomeTaxSeparateStocks = separateTaxAmount(year, "stocks", taxableSeparateStocks);
  const incomeTaxSeparateDividends = separateTaxAmount(year, "listedDividend", taxableSeparateDividends);
  const incomeTaxSeparateTotal = incomeTaxSeparateStocks + incomeTaxSeparateDividends;
  const incomeTaxBase = incomeTaxComprehensive + incomeTaxSeparateTotal;
  // 配当控除の1,000万円枠の判定に使う課税総所得金額等には、申告分離課税の
  // 課税所得金額も含める（No.1250 の「課税総所得金額等」）。
  const taxableForCredits = taxableIncome + taxableSeparateStocks + taxableSeparateDividends;
  // 寄附金の40%上限と外国税額控除の所得総額も、申告分離課税の所得を含めて判定する
  const taxCredits = computeTaxCredits(
    options.taxCredits,
    incomeTaxBase,
    taxableForCredits,
    grandTotalIncome,
    year,
    options.deductions.donationsTotal,
  );
  const taxAfterOtherCredits = Math.max(
    incomeTaxBase - (taxCredits.total - taxCredits.foreignTax),
    0,
  );
  const standardIncomeTax = taxAfterOtherCredits;
  const reconstructionTaxGross = Math.floor((standardIncomeTax * 21) / 1000);
  const reconstructionTax = reconstructionTaxGross - taxCredits.foreignTaxReconstructionPart;
  const incomeTaxAfterForeignCredit = Math.max(
    standardIncomeTax - taxCredits.foreignTaxIncomePart,
    0,
  );
  const finalTax = floor100(incomeTaxAfterForeignCredit + reconstructionTax);
  return {
    year,
    totalIncome,
    grandTotalIncome,
    deductions,
    deductionsTotal: deductions.total,
    taxableIncome,
    taxableSeparateStocks,
    taxableSeparateDividends,
    incomeTaxBase,
    incomeTaxComprehensive,
    incomeTaxSeparateStocks,
    incomeTaxSeparateDividends,
    incomeTaxSeparateTotal,
    taxCredits,
    taxCreditsTotal: taxCredits.total,
    taxAfterOtherCredits,
    standardIncomeTax,
    reconstructionTaxGross,
    reconstructionTax,
    incomeTaxAfterForeignCredit,
    finalTax,
  };
}

/** 申告納税額と第3期分の税額。 */
export interface IncomeTaxSettlement {
  /** 申告納税額。100円未満切捨て。源泉徴収税額の方が多い（還付になる）ときは切り捨てず負のまま */
  declaredTax: number;
  /** 第3期分の税額（申告納税額 − 予定納税額）。正は納める税金、負は還付される税金 */
  thirdPeriodTax: number;
}

/**
 * 所得税及び復興特別所得税の額（外国税額控除後）から源泉徴収税額・予定納税額を
 * 精算する（国税通則法119条の100円未満切捨て）。withholdingTax には配当・株式等の
 * 源泉徴収税額も含めて渡す。
 */
export function incomeTaxSettlementOf(
  tax: IncomeTaxResult,
  withholdingTax: number,
  prepaidTax: number,
): IncomeTaxSettlement {
  const raw = tax.incomeTaxAfterForeignCredit + tax.reconstructionTax - withholdingTax;
  const declaredTax = raw > 0 ? Math.floor(raw / 100) * 100 : raw;
  return { declaredTax, thirdPeriodTax: declaredTax - prepaidTax };
}
