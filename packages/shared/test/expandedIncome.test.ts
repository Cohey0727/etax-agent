/**
 * expandedIncome.test.ts — 配当・一時・株式等譲渡と
 * 分離課税を含む所得税計算の検証。
 */
import { describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_EXPANDED_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  computeDividendIncome,
  computeExpandedIncomes,
  computeIncomeTax,
  computeStockTransfer,
  computeTempIncome,
  comprehensiveTotalIncome,
  normalizeExpandedIncomeInput,
  separateTaxAmount,
} from "../src/index";

// ---------------------------------------------------------------------------
// 一時所得
// ---------------------------------------------------------------------------

describe("一時所得（No.1490）", () => {
  test("特別控除50万円を引き、1/2を算入する", () => {
    const r = computeTempIncome({ revenue: 1_500_000, expenses: 300_000 });
    expect(r.specialDeduction).toBe(500_000);
    expect(r.amount).toBe(700_000);
    expect(r.includedAmount).toBe(350_000);
  });

  test("差引が50万円以下なら所得は0", () => {
    const r = computeTempIncome({ revenue: 400_000, expenses: 100_000 });
    expect(r.specialDeduction).toBe(300_000);
    expect(r.amount).toBe(0);
    expect(r.includedAmount).toBe(0);
  });

  test("支出が収入を超えても所得はマイナスにならない", () => {
    const r = computeTempIncome({ revenue: 100_000, expenses: 500_000 });
    expect(r.amount).toBe(0);
  });

  test("1/2算入額の円未満は切り捨てる", () => {
    const r = computeTempIncome({ revenue: 500_001, expenses: 0 });
    expect(r.amount).toBe(1);
    expect(r.includedAmount).toBe(0);
  });
});

describe("総所得金額（損益通算 → 一時所得の1/2）", () => {
  test("経常所得が黒字なら、一時所得の金額の1/2を加える", () => {
    expect(comprehensiveTotalIncome(1_000_000, 1_500_000)).toBe(1_750_000);
  });

  test("事業などの損失は一時所得と通算してから1/2にする", () => {
    // 事業 −100万・一時所得の金額150万 → (150万 − 100万) × 1/2 = 25万
    expect(comprehensiveTotalIncome(-1_000_000, 1_500_000)).toBe(250_000);
  });

  test("一時所得で引き切れない損失は負のまま残る", () => {
    expect(comprehensiveTotalIncome(-2_000_000, 1_500_000)).toBe(-500_000);
  });

  test("1/2の円未満は切り捨てる", () => {
    expect(comprehensiveTotalIncome(0, 1)).toBe(0);
    expect(comprehensiveTotalIncome(-1, 4)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 配当所得（総合課税）＋配当控除の対象額
// ---------------------------------------------------------------------------

describe("配当所得（No.1330 / No.1250）", () => {
  test("総合課税: 収入金額 − 負債の利子が配当所得", () => {
    const r = computeDividendIncome({
      ...EMPTY_EXPANDED_INCOME.dividend,
      listedRevenue: 800_000,
      generalRevenue: 200_000,
      interestExpense: 100_000,
    });
    expect(r.comprehensiveRevenue).toBe(1_000_000);
    expect(r.comprehensiveIncome).toBe(900_000);
    expect(r.separateIncome).toBe(0);
  });

  test("配当控除の対象額は証券投資信託分を収入金額比で按分する", () => {
    const r = computeDividendIncome({
      ...EMPTY_EXPANDED_INCOME.dividend,
      listedRevenue: 600_000,
      listedTrustRevenue: 200_000,
      generalRevenue: 400_000,
      interestExpense: 0,
    });
    expect(r.creditTrust).toBe(200_000);
    expect(r.creditCorporate).toBe(800_000);
  });

  test("申告不要を選んだ上場配当は申告データに混ざらない", () => {
    const r = computeDividendIncome({
      ...EMPTY_EXPANDED_INCOME.dividend,
      listedRevenue: 500_000,
      listedWithholding: 76_575,
      listedMode: "none",
      generalRevenue: 100_000,
      generalWithholding: 20_420,
    });
    expect(r.comprehensiveRevenue).toBe(100_000);
    expect(r.separateRevenue).toBe(0);
    expect(r.withholding).toBe(20_420);
  });

  test("負債の利子は総合分と分離分へ収入金額比で按分する", () => {
    const r = computeDividendIncome({
      ...EMPTY_EXPANDED_INCOME.dividend,
      listedRevenue: 300_000,
      listedMode: "separate",
      generalRevenue: 700_000,
      interestExpense: 100_000,
    });
    expect(r.interestSeparate).toBe(30_000);
    expect(r.interestComprehensive).toBe(70_000);
    expect(r.separateIncome).toBe(270_000);
    expect(r.comprehensiveIncome).toBe(630_000);
  });

  test("配当所得の赤字（負債の利子 > 収入）は他の所得と通算せず、総所得金額への加算は 0", () => {
    const r = computeExpandedIncomes({
      ...EMPTY_EXPANDED_INCOME,
      dividend: { ...EMPTY_EXPANDED_INCOME.dividend, generalRevenue: 100_000, interestExpense: 400_000 },
    });
    expect(r.dividend.comprehensiveIncome).toBe(-300_000);
    expect(r.comprehensiveAddition).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 株式等譲渡と損益通算
// ---------------------------------------------------------------------------

describe("株式等譲渡（No.1463 / No.1474 / No.1476）", () => {
  test("一般と上場は別区分で計算し、特定口座分は上場へ合算する", () => {
    const r = computeStockTransfer({
      general: { revenue: 1_000_000, otherRevenue: 0, acquisitionCost: 600_000, transferFees: 0, otherExpenses: 0 },
      listed: { revenue: 500_000, otherRevenue: 0, acquisitionCost: 700_000, transferFees: 0, otherExpenses: 0 },
      listedWithholding: 0,
      specialAccounts: [
        { brokerName: "テスト証券", branchName: "", withholdingAccount: true, revenue: 2_000_000, cost: 1_500_000, withholding: 76_575 },
      ],
    });
    expect(r.general.income).toBe(400_000);
    expect(r.listed.income).toBe(300_000);
    expect(r.specialAccountsTotal).toEqual({ revenue: 2_000_000, cost: 1_500_000, withholding: 76_575, count: 1 });
    expect(r.withholding).toBe(76_575);
  });

  test("上場の譲渡損失は申告分離の上場配当と損益通算できる", () => {
    const r = computeExpandedIncomes({
      temp: { revenue: 0, expenses: 0 },
      dividend: {
        ...EMPTY_EXPANDED_INCOME.dividend,
        listedRevenue: 400_000,
        listedMode: "separate",
      },
      stocks: {
        general: { revenue: 0, otherRevenue: 0, acquisitionCost: 0, transferFees: 0, otherExpenses: 0 },
        listed: { revenue: 100_000, otherRevenue: 0, acquisitionCost: 350_000, transferFees: 0, otherExpenses: 0 },
        listedWithholding: 0,
        specialAccounts: [],
      },
    });
    // 上場譲渡損失 250,000 のうち 250,000 を配当 400,000 から通算
    expect(r.listedLossOffsetToDividend).toBe(250_000);
    expect(r.separateDividendIncome).toBe(150_000);
    expect(r.unabsorbedListedLoss).toBe(0);
    expect(r.separateStockIncome).toBe(0);
  });

  test("通算し切れない上場の譲渡損失は参考値として残る（繰越は扱わない）", () => {
    const r = computeExpandedIncomes({
      temp: { revenue: 0, expenses: 0 },
      dividend: {
        ...EMPTY_EXPANDED_INCOME.dividend,
        listedRevenue: 100_000,
        listedMode: "separate",
      },
      stocks: {
        general: { revenue: 0, otherRevenue: 0, acquisitionCost: 0, transferFees: 0, otherExpenses: 0 },
        listed: { revenue: 0, otherRevenue: 0, acquisitionCost: 600_000, transferFees: 0, otherExpenses: 0 },
        listedWithholding: 0,
        specialAccounts: [],
      },
    });
    expect(r.listedLossOffsetToDividend).toBe(100_000);
    expect(r.separateDividendIncome).toBe(0);
    expect(r.unabsorbedListedLoss).toBe(500_000);
  });

  test("一般株式等の譲渡損失は上場の黒字・配当と通算できない", () => {
    const r = computeExpandedIncomes({
      temp: { revenue: 0, expenses: 0 },
      dividend: {
        ...EMPTY_EXPANDED_INCOME.dividend,
        listedRevenue: 300_000,
        listedMode: "separate",
      },
      stocks: {
        general: { revenue: 0, otherRevenue: 0, acquisitionCost: 900_000, transferFees: 0, otherExpenses: 0 },
        listed: { revenue: 800_000, otherRevenue: 0, acquisitionCost: 300_000, transferFees: 0, otherExpenses: 0 },
        listedWithholding: 0,
        specialAccounts: [],
      },
    });
    expect(r.listedLossOffsetToDividend).toBe(0);
    expect(r.separateDividendIncome).toBe(300_000);
    // 一般の赤字は切り捨て、上場の黒字 500,000 のみが分離課税の対象
    expect(r.separateStockIncome).toBe(500_000);
  });

  test("総合課税の配当とは上場の譲渡損失を通算しない", () => {
    const r = computeExpandedIncomes({
      temp: { revenue: 0, expenses: 0 },
      dividend: {
        ...EMPTY_EXPANDED_INCOME.dividend,
        listedRevenue: 400_000,
        listedMode: "comprehensive",
      },
      stocks: {
        general: { revenue: 0, otherRevenue: 0, acquisitionCost: 0, transferFees: 0, otherExpenses: 0 },
        listed: { revenue: 0, otherRevenue: 0, acquisitionCost: 250_000, transferFees: 0, otherExpenses: 0 },
        listedWithholding: 0,
        specialAccounts: [],
      },
    });
    expect(r.listedLossOffsetToDividend).toBe(0);
    expect(r.comprehensiveAddition).toBe(400_000);
    expect(r.unabsorbedListedLoss).toBe(250_000);
  });
});

// ---------------------------------------------------------------------------
// 分離課税を含む所得税計算
// ---------------------------------------------------------------------------

describe("分離課税を含む所得税計算", () => {
  test("医療費控除の足切り・寄附金控除の40%上限は、分離課税の所得を含む総所得金額等で判定する", () => {
    const result = computeIncomeTax({
      year: 2025,
      totalIncome: 1_000_000,
      deductions: { ...EMPTY_DEDUCTION_INPUTS, medicalExpensesPaid: 150_000, donationsTotal: 1_000_000 },
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      separateTaxation: { stockIncome: 3_000_000, dividendIncome: 0 },
    });
    // 総所得金額等 400万円 → 足切り 10万円、寄附金の上限 160万円
    expect(result.deductions.medical).toBe(50_000);
    expect(result.deductions.donations).toBe(998_000);
  });

  test("政党等寄附金の40%上限も総所得金額等で判定する", () => {
    const result = computeIncomeTax({
      year: 2025,
      totalIncome: 1_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, politicalDonations: 1_000_000 },
      separateTaxation: { stockIncome: 9_000_000, dividendIncome: 0 },
    });
    // 総所得金額等 1,000万円 → 対象 100万円（40%上限 400万円の内）→ (100万 − 2,000) × 30%。
    // 所得税額 1,371,000 の25%（342,700）以内
    expect(result.taxCredits.politicalDonations).toBe(299_400);
  });

  test("分離税率は年度パラメータの15%（所得税分）", () => {
    expect(separateTaxAmount(2025, "stocks", 1_000_000)).toBe(150_000);
    expect(separateTaxAmount(2025, "listedDividend", 333_333)).toBe(49_999);
  });

  test("株式等譲渡の税額は15%で、復興特別所得税は合算した基準所得税額にかかる", () => {
    const r = computeIncomeTax({
      year: 2025,
      totalIncome: 1_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      separateTaxation: { stockIncome: 2_000_000, dividendIncome: 0 },
    });
    // 基礎控除88万円（令和7年分・合計所得300万円）は総合100万円の範囲で
    // 引き切れるため、分離の株式等200万円はそのまま課税対象になる。
    expect(r.taxableIncome).toBe(120_000);
    expect(r.incomeTaxComprehensive).toBe(6_000);
    expect(r.taxableSeparateStocks).toBe(2_000_000);
    expect(r.incomeTaxSeparateStocks).toBe(300_000);
    expect(r.incomeTaxBase).toBe(306_000);
    expect(r.standardIncomeTax).toBe(306_000);
    expect(r.reconstructionTax).toBe(6_426);
    expect(r.finalTax).toBe(312_400);
  });

  test("総合の所得がないと基礎控除は分離課税の所得から差し引かれる", () => {
    const r = computeIncomeTax({
      year: 2025,
      totalIncome: 0,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      separateTaxation: { stockIncome: 2_000_000, dividendIncome: 0 },
    });
    // 基礎控除88万円（合計所得200万円）が株式等200万円から差し引かれる
    expect(r.taxableSeparateStocks).toBe(1_120_000);
    expect(r.incomeTaxSeparateStocks).toBe(168_000);
  });

  test("所得控除は総合から先に引き、引き切れない分が分離課税へ配分される", () => {
    const r = computeIncomeTax({
      year: 2025,
      totalIncome: 500_000,
      deductions: {
        ...EMPTY_DEDUCTION_INPUTS,
        socialInsurancePaid: 200_000,
      },
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      separateTaxation: { stockIncome: 1_000_000, dividendIncome: 500_000 },
    });
    // 基礎控除（令和7年分・合計所得233万円以下は88万円）＋社会保険料20万円
    // = 108万円。総合50万円で引き切れず、残り58万円が株式等100万円から
    // 差し引かれ、課税株式等は42万円。配当分離には回らない。
    expect(r.deductionsTotal).toBe(1_080_000);
    expect(r.taxableIncome).toBe(0);
    expect(r.taxableSeparateStocks).toBe(420_000);
    expect(r.taxableSeparateDividends).toBe(500_000);
    expect(r.incomeTaxSeparateStocks).toBe(63_000);
    expect(r.incomeTaxSeparateDividends).toBe(75_000);
  });

  test("配当控除の1,000万円枠は分離課税の課税所得も含めて判定する", () => {
    // 総合の課税所得が900万円台でも、分離の株式等を足して1,000万円を
    // 超える部分の配当は半率（10%→5%）になる。
    const withSeparate = computeIncomeTax({
      year: 2025,
      totalIncome: 10_600_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS, dividendCorporate: 1_000_000 },
      separateTaxation: { stockIncome: 500_000, dividendIncome: 0 },
    });
    // 基礎控除58万円 → 課税総所得 10,020,000。課税総所得金額等は
    // 10,020,000 + 500,000 = 10,520,000。配当以外の課税所得は
    // 9,520,000 で、1,000万円枠の残りは 480,000 → 全率分 480,000×10%、
    // 超過分 520,000×5% = 48,000 + 26,000 = 74,000。
    expect(withSeparate.taxCredits.dividend).toBe(74_000);
  });

  test("分離課税なしでは総合課税だけの計算と一致する", () => {
    const plain = computeIncomeTax({
      year: 2025,
      totalIncome: 5_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    const withEmpty = computeIncomeTax({
      year: 2025,
      totalIncome: 5_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      separateTaxation: { stockIncome: 0, dividendIncome: 0 },
    });
    expect(withEmpty).toEqual(plain);
    expect(plain.grandTotalIncome).toBe(5_000_000);
    expect(plain.incomeTaxSeparateTotal).toBe(0);
  });

  test("合計所得金額は基礎控除の段階判定に使う（分離分を含む）", () => {
    // 総合だけなら令和7年分の基礎控除は合計所得655万円以下で63万円だが、
    // 分離の株式等を足して2,400万円を超えると48万円に逓減する。
    const r = computeIncomeTax({
      year: 2025,
      totalIncome: 5_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      separateTaxation: { stockIncome: 19_500_000, dividendIncome: 0 },
    });
    expect(r.grandTotalIncome).toBe(24_500_000);
    expect(r.deductions.basic).toBe(320_000);
  });
});

// ---------------------------------------------------------------------------
// 正規化
// ---------------------------------------------------------------------------

describe("拡張所得入力の正規化", () => {
  test("欠けた区分は空になり、不正な方式は comprehensive に寄せる", () => {
    const r = normalizeExpandedIncomeInput({
      dividend: { ...EMPTY_EXPANDED_INCOME.dividend, listedRevenue: 100_000, listedMode: "bogus" as never },
    });
    expect(r.dividend.listedRevenue).toBe(100_000);
    expect(r.dividend.listedMode).toBe("comprehensive");
    expect(r.temp).toEqual({ revenue: 0, expenses: 0 });
    expect(r.stocks.specialAccounts).toEqual([]);
  });

  test("負の入力金額は計算側で0に寄せられ、所得を水増ししない", () => {
    const r = computeExpandedIncomes(
      normalizeExpandedIncomeInput({
        temp: { revenue: -100_000, expenses: 0 },
        stocks: {
          general: { revenue: -1, otherRevenue: 0, acquisitionCost: -500_000, transferFees: 0, otherExpenses: 0 },
          listed: { revenue: 0, otherRevenue: 0, acquisitionCost: 0, transferFees: 0, otherExpenses: 0 },
          listedWithholding: 0,
          specialAccounts: [],
        },
      }),
    );
    expect(r.temp.revenue).toBe(0);
    expect(r.stocks.general.income).toBe(0);
    expect(r.separateStockIncome).toBe(0);
  });
});
