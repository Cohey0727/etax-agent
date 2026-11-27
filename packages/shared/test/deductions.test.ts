/**
 * deductions.test.ts — 所得控除・税額控除・所得税額の検証（bun test）。
 * 検証する主な税務ルール（国税庁タックスアンサー準拠、令和5〜7年分）:
 *   (a) 基礎控除: 令和6年分 所得500万円 → 48万円 / 令和7年分 所得100万円 → 95万円
 *   (b) 配偶者特別控除の段階表（配偶者所得100万円・本人所得800万円 → 36万円）
 *   (c) 特定親族特別控除は令和7年分のみ（所得70万円 → 63万円）
 *   (d) 生命保険料控除の新旧合算ルール（旧保険料6万円超は旧式のみ）
 *   (e) 所得税額の全計算（速算表 → 税額控除 → 復興特別所得税 → 100円未満切捨て）
 */
import { describe, expect, test } from "bun:test";
import {
  basicDeduction,
  casualtyLossDeduction,
  certifiedNpoDonationCredit,
  computeIncomeDeductions,
  computeIncomeTax,
  computeTaxCredits,
  dependentDeduction,
  disabilityDeduction,
  dividendCredit,
  donationDeduction,
  earthquakeInsuranceDeduction,
  foreignTaxCredit,
  housingLoanCredit,
  incomeTaxOnTaxableIncome,
  lifeInsuranceDeduction,
  medicalDeduction,
  politicalDonationCredit,
  seismicRetrofitCredit,
  specialRelativeDeduction,
  spouseDeduction,
  spouseSpecialDeduction,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_TAX_CREDIT_INPUTS,
  incomeTaxSettlementOf,
} from "../src/index";

describe("基礎控除", () => {
  test("令和6年分: 所得500万円 → 48万円", () => {
    expect(basicDeduction(2024, 5_000_000)).toBe(480_000);
  });
  test("令和7年分: 所得100万円 → 95万円（改正＋上乗せ）", () => {
    expect(basicDeduction(2025, 1_000_000)).toBe(950_000);
  });
  test("令和7年分: 所得1,044万円 → 58万円", () => {
    expect(basicDeduction(2025, 10_444_000)).toBe(580_000);
  });
  test("令和7年分: 所得2,430万円 → 32万円", () => {
    expect(basicDeduction(2025, 24_300_000)).toBe(320_000);
  });
  test("令和6年分: 所得2,600万円 → 0円", () => {
    expect(basicDeduction(2024, 26_000_000)).toBe(0);
  });
  test("令和8年分: 所得100万円 → 104万円（令和8年度改正、No.1199）", () => {
    expect(basicDeduction(2026, 1_000_000)).toBe(1_040_000);
  });
  test("令和9年分: 所得100万円 → 104万円（令和8年分と同額）", () => {
    expect(basicDeduction(2027, 1_000_000)).toBe(1_040_000);
  });
  test("令和8・9年分: 段階（655万円以下 67万円 / 2,350万円以下 62万円 / 2,400万円以下 48万円）", () => {
    expect(basicDeduction(2026, 6_550_000)).toBe(670_000);
    expect(basicDeduction(2026, 23_500_000)).toBe(620_000);
    expect(basicDeduction(2026, 24_000_000)).toBe(480_000);
    expect(basicDeduction(2027, 6_550_000)).toBe(670_000);
    expect(basicDeduction(2027, 24_500_000)).toBe(320_000);
    expect(basicDeduction(2027, 25_000_001)).toBe(0);
  });
});

describe("配偶者控除・配偶者特別控除", () => {
  test("配偶者控除: 一般・本人所得800万円 → 38万円", () => {
    expect(spouseDeduction("general", 8_000_000)).toBe(380_000);
  });
  test("配偶者控除: 老人・本人所得800万円 → 48万円", () => {
    expect(spouseDeduction("elderly", 8_000_000)).toBe(480_000);
  });
  test("配偶者控除: 一般・本人所得930万円 → 26万円", () => {
    expect(spouseDeduction("general", 9_300_000)).toBe(260_000);
  });
  test("配偶者控除: 本人所得1,050万円 → 0円", () => {
    expect(spouseDeduction("general", 10_500_000)).toBe(0);
  });
  test("配偶者特別控除: 配偶者所得100万円・本人800万円 → 36万円", () => {
    expect(spouseSpecialDeduction(2024, 1_000_000, 8_000_000)).toBe(360_000);
  });
  test("配偶者特別控除: 配偶者所得100万円・本人930万円 → 24万円", () => {
    expect(spouseSpecialDeduction(2024, 1_000_000, 9_300_000)).toBe(240_000);
  });
  test("配偶者特別控除: 配偶者所得が下限以下 → 0円（配偶者控除の側）", () => {
    expect(spouseSpecialDeduction(2024, 480_000, 8_000_000)).toBe(0);
    expect(spouseSpecialDeduction(2025, 580_000, 8_000_000)).toBe(0);
  });
  test("配偶者特別控除: 令和7年分は下限が58万円超から", () => {
    expect(spouseSpecialDeduction(2025, 590_000, 8_000_000)).toBe(380_000);
  });
  test("配偶者特別控除: 配偶者所得133万円 → 3万円、134万円 → 0円", () => {
    expect(spouseSpecialDeduction(2024, 1_330_000, 8_000_000)).toBe(30_000);
    expect(spouseSpecialDeduction(2024, 1_340_000, 8_000_000)).toBe(0);
  });
  test("配偶者特別控除: 配偶者なし（null） → 0円", () => {
    expect(spouseSpecialDeduction(2024, null, 8_000_000)).toBe(0);
  });
  test("合算: 配偶者の所得が要件を超えるなら、区分を選んでいても配偶者控除は付かず特別控除だけ", () => {
    const inputs = { ...EMPTY_DEDUCTION_INPUTS, spouseCategory: "general" as const };
    const special = computeIncomeDeductions(2025, 5_000_000, { ...inputs, spouseTotalIncome: 1_000_000 });
    expect(special.spouse).toBe(0);
    expect(special.spouseSpecial).toBe(360_000);
    const over = computeIncomeDeductions(2025, 5_000_000, { ...inputs, spouseTotalIncome: 2_000_000 });
    expect(over.spouse).toBe(0);
    expect(over.spouseSpecial).toBe(0);
  });
  test("合算: 配偶者の所得が要件以下なら配偶者控除だけ（未入力は区分どおり）", () => {
    const inputs = { ...EMPTY_DEDUCTION_INPUTS, spouseCategory: "general" as const };
    const within = computeIncomeDeductions(2025, 5_000_000, { ...inputs, spouseTotalIncome: 580_000 });
    expect(within.spouse).toBe(380_000);
    expect(within.spouseSpecial).toBe(0);
    const unknown = computeIncomeDeductions(2025, 5_000_000, { ...inputs, spouseTotalIncome: null });
    expect(unknown.spouse).toBe(380_000);
  });
});

describe("特定親族特別控除", () => {
  test("令和7年分: 親族所得70万円 → 63万円", () => {
    expect(specialRelativeDeduction(2025, 700_000)).toBe(630_000);
  });
  test("令和7年分: 親族所得123万円 → 3万円", () => {
    expect(specialRelativeDeduction(2025, 1_230_000)).toBe(30_000);
  });
  test("令和7年分: 親族所得58万円以下 → 0円（扶養控除の側）", () => {
    expect(specialRelativeDeduction(2025, 580_000)).toBe(0);
  });
  test("令和6年分は制度なし → 0円", () => {
    expect(specialRelativeDeduction(2024, 700_000)).toBe(0);
  });
});

describe("扶養控除・障害者控除", () => {
  test("扶養控除: 一般・特定・老人・同居老親等 各1人 → 207万円", () => {
    expect(
      dependentDeduction({ general: 1, specific: 1, elderly: 1, elderlyCohabiting: 1 }),
    ).toBe(2_070_000);
  });
  test("障害者控除: 障害者・特別・同居特別 各1人 → 142万円", () => {
    expect(disabilityDeduction({ general: 1, special: 1, specialCohabiting: 1 })).toBe(1_420_000);
  });
});

describe("生命保険料控除", () => {
  const empty = { newGeneral: 0, newCareMedical: 0, newPension: 0, oldGeneral: 0, oldPension: 0 };
  test("新契約のみ: 一般3万円 → 2.5万円", () => {
    expect(lifeInsuranceDeduction({ ...empty, newGeneral: 30_000 })).toBe(25_000);
  });
  test("新契約のみ: 一般8万円 → 4万円（上限）", () => {
    expect(lifeInsuranceDeduction({ ...empty, newGeneral: 80_000 })).toBe(40_000);
  });
  test("旧契約のみ: 一般10万円 → 5万円（上限）", () => {
    expect(lifeInsuranceDeduction({ ...empty, oldGeneral: 100_000 })).toBe(50_000);
  });
  test("新旧両方・旧6万円以下: 合算して上限4万円", () => {
    // 新4万円 → 3万円、旧5万円 → 3.75万円、合算 6.75万円 → 上限 4万円
    expect(lifeInsuranceDeduction({ ...empty, newGeneral: 40_000, oldGeneral: 50_000 })).toBe(40_000);
  });
  test("新旧両方・旧6万円超: 旧契約の式のみ（7万円 → 4.25万円）", () => {
    expect(lifeInsuranceDeduction({ ...empty, newGeneral: 40_000, oldGeneral: 70_000 })).toBe(42_500);
  });
  test("令和8・9年分: 23歳未満の扶養親族がいれば一般（新契約）の上限は6万円", () => {
    const inputs = (newGeneral: number, oldGeneral = 0) => ({
      ...EMPTY_DEDUCTION_INPUTS,
      lifeInsurance: { ...empty, newGeneral, oldGeneral },
      hasDependentUnder23: true,
    });
    expect(computeIncomeDeductions(2026, 5_000_000, inputs(120_000)).lifeInsurance).toBe(60_000);
    // 8万円 × 1/4 + 3万円
    expect(computeIncomeDeductions(2026, 5_000_000, inputs(80_000)).lifeInsurance).toBe(50_000);
    expect(computeIncomeDeductions(2027, 5_000_000, inputs(30_000)).lifeInsurance).toBe(30_000);
    // 新旧合算: 新8万円 → 5万円、旧4万円 → 3.25万円、合算の上限6万円
    expect(computeIncomeDeductions(2026, 5_000_000, inputs(80_000, 40_000)).lifeInsurance).toBe(60_000);
  });
  test("23歳未満の扶養親族がいても令和7年分は4万円、いなければ令和8年分も4万円", () => {
    const life = { ...empty, newGeneral: 120_000 };
    expect(
      computeIncomeDeductions(2025, 5_000_000, {
        ...EMPTY_DEDUCTION_INPUTS,
        lifeInsurance: life,
        hasDependentUnder23: true,
      }).lifeInsurance,
    ).toBe(40_000);
    expect(
      computeIncomeDeductions(2026, 5_000_000, { ...EMPTY_DEDUCTION_INPUTS, lifeInsurance: life })
        .lifeInsurance,
    ).toBe(40_000);
  });
  test("全体の上限12万円", () => {
    expect(
      lifeInsuranceDeduction({
        newGeneral: 200_000,
        newCareMedical: 200_000,
        newPension: 200_000,
        oldGeneral: 0,
        oldPension: 0,
      }),
    ).toBe(120_000);
  });
});

describe("地震保険料控除", () => {
  test("地震部分6万円 → 5万円（上限）", () => {
    expect(earthquakeInsuranceDeduction({ earthquake: 60_000, oldLongTerm: 0 })).toBe(50_000);
  });
  test("旧長期2万円 → 1.5万円", () => {
    expect(earthquakeInsuranceDeduction({ earthquake: 0, oldLongTerm: 20_000 })).toBe(15_000);
  });
  test("両方: 地震3万円 + 旧長期2万円 → 4.5万円", () => {
    expect(earthquakeInsuranceDeduction({ earthquake: 30_000, oldLongTerm: 20_000 })).toBe(45_000);
  });
});

describe("医療費控除・寄附金控除・雑損控除", () => {
  test("医療費: 支払30万円・補填5万円・所得1,000万円 → 15万円", () => {
    expect(medicalDeduction(300_000, 50_000, 10_000_000)).toBe(150_000);
  });
  test("医療費: 所得150万円なら足切りは所得の5%（7.5万円）", () => {
    expect(medicalDeduction(300_000, 50_000, 1_500_000)).toBe(175_000);
  });
  test("医療費: 足切り以下 → 0円", () => {
    expect(medicalDeduction(50_000, 0, 10_000_000)).toBe(0);
  });
  test("寄附金: 10万円・所得1,000万円 → 98,000円", () => {
    expect(donationDeduction(100_000, 10_000_000)).toBe(98_000);
  });
  test("寄附金: 所得10万円なら総所得の40%が上限 → 38,000円", () => {
    expect(donationDeduction(100_000, 100_000)).toBe(38_000);
  });
  test("雑損: 損害100万円・災害関連20万円・補填10万円・所得500万円 → 60万円", () => {
    expect(
      casualtyLossDeduction(
        { damageAmount: 1_000_000, disasterRelatedExpenses: 200_000, otherRelatedExpenses: 0, compensation: 100_000 },
        5_000_000,
      ),
    ).toBe(600_000);
  });
  test("雑損: 災害関連支出の式が大きい場合（取壊し30万円のみ） → 25万円", () => {
    expect(
      casualtyLossDeduction(
        { damageAmount: 0, disasterRelatedExpenses: 300_000, otherRelatedExpenses: 0, compensation: 0 },
        10_000_000,
      ),
    ).toBe(250_000);
  });
  test("雑損: 算式(2)の補填金は損害金額を超える部分だけ差し引く（No.1110 注記）", () => {
    // 損害10万円・災害関連30万円・補填25万円・所得100万円
    // 算式(1): 10万+30万−25万−10万 = 5万円
    // 算式(2): 30万 −（25万−10万）− 5万 = 10万円 → 大きい方 10万円
    expect(
      casualtyLossDeduction(
        { damageAmount: 100_000, disasterRelatedExpenses: 300_000, otherRelatedExpenses: 0, compensation: 250_000 },
        1_000_000,
      ),
    ).toBe(100_000);
  });
});

describe("税額控除", () => {
  test("住宅ローン: 残高3,000万円・限度35万円 → 21万円", () => {
    expect(housingLoanCredit(30_000_000, 350_000)).toBe(210_000);
  });
  test("住宅ローン: 限度額が上限（限度14万円 → 14万円）", () => {
    expect(housingLoanCredit(30_000_000, 140_000)).toBe(140_000);
  });
  test("住宅ローン: 2021年以前の居住は1%（残高22,131,745円・限度40万円 → 221,300円）", () => {
    expect(housingLoanCredit(22_131_745, 400_000, 0.01)).toBe(221_300);
  });
  test("住宅ローン: 1%でも限度額が上限（限度20万円 → 20万円）", () => {
    expect(housingLoanCredit(22_131_745, 200_000, 0.01)).toBe(200_000);
  });
  test("定額減税: 税額控除の合計に算入される", () => {
    const result = computeIncomeTax({
      year: 2024,
      totalIncome: 5_446_922,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, flatReduction: 30_000 },
    });
    expect(result.taxCredits.flatReduction).toBe(30_000);
    expect(result.taxCreditsTotal).toBe(30_000);
  });
  test("定額減税: 対象年分（令和6年分）以外では入力があっても 0", () => {
    const options = {
      year: 2025,
      totalIncome: 5_446_922,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    };
    const without = computeIncomeTax(options);
    const withInput = computeIncomeTax({
      ...options,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, flatReduction: 30_000 },
    });
    expect(withInput.taxCredits.flatReduction).toBe(0);
    expect(withInput.finalTax).toBe(without.finalTax);
  });
  test("配当控除: 課税総所得1,000万円以下なら配当20万円 → 2万円", () => {
    expect(dividendCredit(200_000, 0, 7_854_000)).toBe(20_000);
  });
  test("配当控除: 課税総所得が1,000万円超なら半率 → 1万円", () => {
    expect(dividendCredit(200_000, 0, 12_000_000)).toBe(10_000);
  });
  test("配当控除: 証券投資信託の分配10万円 → 5,000円", () => {
    expect(dividendCredit(0, 100_000, 5_000_000)).toBe(5_000);
  });
  test("政党等寄附金: 10.2万円 → 3万円（100円未満切捨て）", () => {
    expect(politicalDonationCredit(102_000, 10_000_000)).toBe(30_000);
  });
  test("政党等寄附金: 対象寄附金は総所得金額等の40%が上限", () => {
    // 所得100万円 → 対象は40万円まで。（40万 − 2,000）× 30% = 119,400円
    expect(politicalDonationCredit(1_000_000, 1_000_000)).toBe(119_400);
  });
  test("認定NPO寄附金: 10.2万円 → 4万円", () => {
    expect(certifiedNpoDonationCredit(102_000, 10_000_000)).toBe(40_000);
    expect(certifiedNpoDonationCredit(1_002_000, 10_000_000)).toBe(400_000);
  });
  test("所得税額の25%の上限は、政党等と認定NPO等でそれぞれ別にかかる", () => {
    const credits = computeTaxCredits(
      { ...EMPTY_TAX_CREDIT_INPUTS, politicalDonations: 1_002_000, certifiedNpoDonations: 1_002_000 },
      1_000_000,
      0,
      10_000_000,
    );
    expect(credits.politicalDonations).toBe(250_000);
    expect(credits.certifiedNpoDonations).toBe(250_000);
  });
  test("政党等・認定NPO等の両方: 2,000円の足切りは1回だけ（No.1260）", () => {
    const credits = computeTaxCredits(
      { ...EMPTY_TAX_CREDIT_INPUTS, politicalDonations: 1_000_000, certifiedNpoDonations: 1_000_000 },
      2_000_000,
      0,
      10_000_000,
    );
    // 政党等 (100万 − 2,000) × 30% = 299,400。認定NPO等は足切り済みで 100万 × 40% = 400,000
    expect(credits.politicalDonations).toBe(299_400);
    expect(credits.certifiedNpoDonations).toBe(400_000);
  });
  test("寄附金控除（所得控除）の寄附金があれば、税額控除の足切りと40%上限はその残り", () => {
    const result = computeIncomeTax({
      year: 2025,
      totalIncome: 10_000_000,
      deductions: { ...EMPTY_DEDUCTION_INPUTS, donationsTotal: 3_900_000 },
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, politicalDonations: 1_000_000 },
    });
    // 40%上限 400万円のうち寄附金控除で 390万円 → 政党等の対象は 10万円、足切りは残りなし
    expect(result.deductions.donations).toBe(3_898_000);
    expect(result.taxCredits.politicalDonations).toBe(30_000);
  });
  test("配当控除: 1,000万円の枠は剰余金配当等から先に充当する", () => {
    // 配当以外の所得990万円・株式配当10万円・投信分配10万円、課税総所得1,010万円
    // 枠10万円は株式配当に充当（10%）、投信は半率（2.5%）→ 10,000 + 2,500
    expect(dividendCredit(100_000, 100_000, 10_100_000)).toBe(12_500);
  });
  test("耐震改修: 標準費用200万円・その他100万円 → 25万円", () => {
    expect(seismicRetrofitCredit(2_000_000, 1_000_000)).toBe(250_000);
  });
  test("耐震改修: A + B の合算は1,000万円が上限", () => {
    // A 250万円（上限）× 10% + B は 1,000万 − 250万 = 750万円 × 5%
    expect(seismicRetrofitCredit(2_500_000, 9_000_000)).toBe(625_000);
  });
  test("外国税額: 所得税分は限度額 = 差引所得税額 × 国外所得/所得総額", () => {
    const small = foreignTaxCredit(100_000, 2_000_000, 10_000_000, 1_500_000);
    expect(small.incomePart).toBe(100_000);
    expect(small.reconstructionPart).toBe(0);
    expect(small.total).toBe(100_000);
  });
  test("外国税額: 所得税分を超えた分は復興税分に回る（別添4の按分）", () => {
    // 所得税額 1,500,000・割合20% → 所得税限度額 300,000。基準所得税額は
    // 外国税額控除前の 1,500,000 で、復興税（控除前）31,500 の 20% = 6,300 が復興税分
    const split = foreignTaxCredit(500_000, 2_000_000, 10_000_000, 1_500_000);
    expect(split.incomePart).toBe(300_000);
    expect(split.reconstructionPart).toBe(6_300);
    expect(split.total).toBe(306_300);
  });
});

describe("所得税額の計算", () => {
  test("速算表の境界: 課税所得194.9万円 → 97,450円、195万円 → 97,500円", () => {
    expect(incomeTaxOnTaxableIncome(1_949_000)).toBe(97_450);
    expect(incomeTaxOnTaxableIncome(1_950_000)).toBe(97_500);
  });

  test("全計算（令和5年分）: 所得1,044.4万円、社会保険料120万円・小規模共済84万円・生命保険料（新・一般12万円）・地震3万円", () => {
    const result = computeIncomeTax({
      year: 2023,
      totalIncome: 10_444_000,
      deductions: {
        ...EMPTY_DEDUCTION_INPUTS,
        socialInsurancePaid: 1_200_000,
        smallBusinessMutualAidPaid: 840_000,
        lifeInsurance: { newGeneral: 120_000, newCareMedical: 0, newPension: 0, oldGeneral: 0, oldPension: 0 },
        earthquakeInsurance: { earthquake: 30_000, oldLongTerm: 0 },
      },
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    // 所得控除: 120万 + 84万 + 4万 + 3万 + 基礎48万 = 259万円
    expect(result.deductionsTotal).toBe(2_590_000);
    expect(result.taxableIncome).toBe(7_854_000);
    // 785.4万円 × 23% − 636,000 = 1,170,420円
    expect(result.incomeTaxBase).toBe(1_170_420);
    // 復興特別所得税: 1,170,420 × 2.1% = 24,578円（円未満切捨て）
    expect(result.reconstructionTax).toBe(24_578);
    // 確定税額: 1,194,998 → 100円未満切捨て 1,194,900円
    expect(result.finalTax).toBe(1_194_900);
  });

  test("全計算（令和7年分）: 所得100万円・控除なし → 基礎控除95万円で課税所得5万円、税額2,500円", () => {
    const result = computeIncomeTax({
      year: 2025,
      totalIncome: 1_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(result.deductionsTotal).toBe(950_000);
    expect(result.taxableIncome).toBe(50_000);
    expect(result.incomeTaxBase).toBe(2_500);
    expect(result.finalTax).toBe(2_500);
  });

  test("全計算（令和5年分）: 住宅ローン控除が税額から引かれ、復興税は控除後の額にかかる", () => {
    const result = computeIncomeTax({
      year: 2023,
      totalIncome: 10_444_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, housingLoanBalance: 30_000_000, housingLoanLimit: 210_000 },
    });
    // 基礎控除のみ: 課税所得 996.4万円 → 税額 996.4万 × 33% − 1,536,000 = 1,752,120円
    expect(result.taxableIncome).toBe(9_964_000);
    expect(result.incomeTaxBase).toBe(1_752_120);
    expect(result.taxCreditsTotal).toBe(210_000);
    // 復興税: (1,752,120 − 210,000) × 2.1% = 32,384円
    expect(result.reconstructionTax).toBe(32_384);
    // 確定税額: 1,574,504 → 1,574,500円
    expect(result.finalTax).toBe(1_574_500);
  });

  test("所得控除の合算に基礎控除が自動で入る", () => {
    const breakdown = computeIncomeDeductions(2023, 10_444_000, EMPTY_DEDUCTION_INPUTS);
    expect(breakdown.basic).toBe(480_000);
    expect(breakdown.total).toBe(480_000);
  });

  test("外国税額控除がある場合: 基準所得税額は外国税額控除前の所得税額、復興税はその2.1%", () => {
    const result = computeIncomeTax({
      year: 2023,
      totalIncome: 10_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, foreignTaxPaid: 500_000, foreignIncome: 2_000_000 },
    });
    // 課税所得 952万円 → 所得税額 952万 × 33% − 1,536,000 = 1,605,600
    expect(result.incomeTaxBase).toBe(1_605_600);
    expect(result.taxAfterOtherCredits).toBe(1_605_600);
    // 基準所得税額 = 外国税額控除を適用しないで計算した所得税額
    expect(result.standardIncomeTax).toBe(1_605_600);
    // 復興税（外国税額控除前）= 1,605,600 × 2.1% = 33,717
    expect(result.reconstructionTaxGross).toBe(33_717);
    // 所得税分: 限度額 1,605,600 × 20% = 321,120
    expect(result.taxCredits.foreignTaxIncomePart).toBe(321_120);
    // 復興税分: 限度額 33,717 × 20% = 6,743
    expect(result.taxCredits.foreignTaxReconstructionPart).toBe(6_743);
    expect(result.incomeTaxAfterForeignCredit).toBe(1_284_480);
    expect(result.reconstructionTax).toBe(26_974);
    // 確定税額: 1,284,480 + 26,974 = 1,311,454 → 1,311,400
    expect(result.finalTax).toBe(1_311_400);
  });

  test("国税庁 別添4の計算例（令和6年分・定額減税と外国税額控除の併用）と一致する", () => {
    // 所得総額 3,280,000・調整国外所得金額 280,000・外国所得税額 28,000・定額減税 90,000。
    // 所得控除 138万円で課税所得 190万円 → 再差引所得税額 95,000
    const result = computeIncomeTax({
      year: 2024,
      totalIncome: 3_280_000,
      deductions: { ...EMPTY_DEDUCTION_INPUTS, socialInsurancePaid: 900_000 },
      taxCredits: {
        ...EMPTY_TAX_CREDIT_INPUTS,
        foreignTaxPaid: 28_000,
        foreignIncome: 280_000,
        flatReduction: 90_000,
      },
    });
    expect(result.taxableIncome).toBe(1_900_000);
    expect(result.incomeTaxBase).toBe(95_000);
    // 所得税の控除限度額は再差引所得税額 95,000 を基に 8,109
    expect(result.taxCredits.foreignTaxIncomePart).toBe(8_109);
    // 基準所得税額 = 95,000 − 定額減税 90,000 = 5,000、復興税（外税前）105
    expect(result.standardIncomeTax).toBe(5_000);
    expect(result.reconstructionTaxGross).toBe(105);
    // 復興税分の控除限度額 = 105 × 280,000 / 3,280,000 = 8
    expect(result.taxCredits.foreignTaxReconstructionPart).toBe(8);
    expect(result.taxCredits.foreignTax).toBe(8_117);
    // 所得税額 = 95,000 − 8,109 − 90,000 → 0、復興税（外税後）= 97
    expect(result.incomeTaxAfterForeignCredit).toBe(0);
    expect(result.reconstructionTax).toBe(97);
    // 所得税額＋復興特別所得税額 = 97（源泉徴収 0 なら100円未満切捨てで 0）
    expect(result.incomeTaxAfterForeignCredit + result.reconstructionTax).toBe(97);
    expect(result.finalTax).toBe(0);
  });
});

describe("寡婦・ひとり親・勤労学生の所得要件と排他", () => {
  test("合計所得500万円以下なら ひとり親 35万円・寡婦 27万円", () => {
    const single = computeIncomeDeductions(2025, 5_000_000, {
      ...EMPTY_DEDUCTION_INPUTS,
      isSingleParent: true,
    });
    expect(single.singleParent).toBe(350_000);
    const widow = computeIncomeDeductions(2025, 5_000_000, {
      ...EMPTY_DEDUCTION_INPUTS,
      isWidow: true,
    });
    expect(widow.widow).toBe(270_000);
  });
  test("令和9年分以後のひとり親控除は38万円", () => {
    const input = { ...EMPTY_DEDUCTION_INPUTS, isSingleParent: true };
    expect(computeIncomeDeductions(2027, 3_000_000, input).singleParent).toBe(380_000);
    expect(computeIncomeDeductions(2026, 3_000_000, input).singleParent).toBe(350_000);
  });
  test("合計所得500万円超は ひとり親・寡婦とも 0", () => {
    const b = computeIncomeDeductions(2025, 5_000_001, {
      ...EMPTY_DEDUCTION_INPUTS,
      isSingleParent: true,
      isWidow: true,
    });
    expect(b.singleParent).toBe(0);
    expect(b.widow).toBe(0);
  });
  test("両方該当する場合はひとり親が優先し寡婦は付かない（排他）", () => {
    const b = computeIncomeDeductions(2025, 3_000_000, {
      ...EMPTY_DEDUCTION_INPUTS,
      isSingleParent: true,
      isWidow: true,
    });
    expect(b.singleParent).toBe(350_000);
    expect(b.widow).toBe(0);
  });
  test("勤労学生は年度パラメータの所得上限以下だけ付く（令和7年分 85万円）", () => {
    const ok = computeIncomeDeductions(2025, 850_000, {
      ...EMPTY_DEDUCTION_INPUTS,
      isWorkingStudent: true,
    });
    expect(ok.workingStudent).toBe(270_000);
    const over = computeIncomeDeductions(2025, 850_001, {
      ...EMPTY_DEDUCTION_INPUTS,
      isWorkingStudent: true,
    });
    expect(over.workingStudent).toBe(0);
  });
});

describe("incomeTaxSettlementOf", () => {
  const base = () =>
    computeIncomeTax({
      year: 2025,
      totalIncome: 5_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });

  test("納付: 申告納税額は100円未満切捨て、第3期分は予定納税額を引く", () => {
    const tax = base();
    const result = incomeTaxSettlementOf(tax, 12_345, 100_000);
    const raw = tax.incomeTaxAfterForeignCredit + tax.reconstructionTax - 12_345;
    expect(result.declaredTax).toBe(Math.floor(raw / 100) * 100);
    expect(result.thirdPeriodTax).toBe(result.declaredTax - 100_000);
  });

  test("還付: 源泉徴収税額の方が多ければ切り捨てず負のまま", () => {
    const tax = base();
    const withholding = tax.finalTax + 12_345;
    const result = incomeTaxSettlementOf(tax, withholding, 0);
    expect(result.declaredTax).toBe(tax.incomeTaxAfterForeignCredit + tax.reconstructionTax - withholding);
    expect(result.declaredTax).toBeLessThan(0);
  });
});
