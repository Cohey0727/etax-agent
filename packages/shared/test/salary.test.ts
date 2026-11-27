/**
 * salary.test.ts — 給与所得の金額・給与所得控除額の検証（No.1410）。
 * 年度ごとの段階表は taxParameters（TAX_PARAMETERS）が持つ。
 */
import { describe, expect, test } from "bun:test";
import {
  EMPTY_MISC_INCOME,
  EMPTY_SALARY_INCOME,
  computeManualIncomes,
  publicPensionIncome,
  salaryAdjustmentDeduction1,
  salaryAdjustmentDeduction2,
  salaryDeductionAmount,
  salaryIncomeAmount,
} from "../src/deductions";

describe("給与所得の金額", () => {
  test("令和6年分（最低保障額55万円）", () => {
    expect(salaryIncomeAmount(2024, 1_000_000)).toBe(450_000);
    // 1,625,000 は別表第五では 1,624,000 の区分（4で割って千円未満切捨て）で計算する
    expect(salaryIncomeAmount(2024, 1_625_000)).toBe(1_074_000);
    // 162.5万円超〜180万円: ×40%−10万円
    expect(salaryDeductionAmount(2024, 1_700_000)).toBe(580_000);
    expect(salaryIncomeAmount(2024, 1_700_000)).toBe(1_120_000);
    // 500万円: ×20%+44万円 = 144万円
    expect(salaryDeductionAmount(2024, 5_000_000)).toBe(1_440_000);
    expect(salaryIncomeAmount(2024, 5_000_000)).toBe(3_560_000);
  });

  test("令和7年分（最低保障額65万円・190万円まで）", () => {
    expect(salaryIncomeAmount(2025, 1_900_000)).toBe(1_250_000);
    // 別表第五: 最低保障帯では端数整理（4,000円刻み）をせず 収入 − 65万円
    expect(salaryIncomeAmount(2025, 1_899_999)).toBe(1_249_999);
    expect(salaryIncomeAmount(2025, 1_234_567)).toBe(584_567);
    expect(salaryIncomeAmount(2025, 5_000_000)).toBe(3_560_000);
    // 850万円: ×10%+110万円 = 195万円（上限と一致）
    expect(salaryDeductionAmount(2025, 8_500_000)).toBe(1_950_000);
    // 850万円超は上限195万円
    expect(salaryIncomeAmount(2025, 10_000_000)).toBe(8_050_000);
    // 収入が最低保障額未満なら所得は0
    expect(salaryIncomeAmount(2025, 500_000)).toBe(0);
  });

  test("令和8年分（最低保障額74万円・220万円まで）", () => {
    expect(salaryIncomeAmount(2026, 2_200_000)).toBe(1_460_000);
    expect(salaryIncomeAmount(2026, 2_000_000)).toBe(1_260_000);
    expect(salaryIncomeAmount(2027, 2_200_000)).toBe(1_460_000);
  });

  test("660万円未満は別表第五の方式（4で割って千円未満切捨て→×4）", () => {
    // 5,001,000円は 5,000,000円の区分で計算する
    expect(salaryIncomeAmount(2025, 5_001_000)).toBe(3_560_000);
    expect(salaryIncomeAmount(2025, 5_003_999)).toBe(3_560_000);
  });
});

describe("所得金額調整控除（子ども・特別障害者等、No.1411）", () => {
  test("850万円以下・対象外は 0", () => {
    expect(salaryAdjustmentDeduction1(8_500_000, true)).toBe(0);
    expect(salaryAdjustmentDeduction1(9_000_000, false)).toBe(0);
  });

  test("（収入 − 850万円）× 10%、収入の上限は1,000万円", () => {
    expect(salaryAdjustmentDeduction1(9_000_000, true)).toBe(50_000);
    expect(salaryAdjustmentDeduction1(12_000_000, true)).toBe(150_000);
  });

  test("1円未満の端数は切り上げ", () => {
    expect(salaryAdjustmentDeduction1(8_555_555, true)).toBe(5_556);
  });
});

describe("所得金額調整控除（給与＋年金、No.1411）", () => {
  test("両方あり合計10万円超で適用、上限10万円", () => {
    expect(salaryAdjustmentDeduction2(3_560_000, 2_350_000)).toBe(100_000);
    expect(salaryAdjustmentDeduction2(50_000, 80_000)).toBe(30_000);
  });

  test("合計10万円以下・片方だけでは 0", () => {
    expect(salaryAdjustmentDeduction2(50_000, 40_000)).toBe(0);
    expect(salaryAdjustmentDeduction2(3_560_000, 0)).toBe(0);
    expect(salaryAdjustmentDeduction2(0, 2_350_000)).toBe(0);
  });
});

describe("公的年金等に係る雑所得（No.1600）", () => {
  test("国税庁の具体例: 65歳以上・他所得500万円・年金350万円 → 235万円", () => {
    expect(publicPensionIncome(3_500_000, true, 5_000_000)).toBe(2_350_000);
  });

  test("最低保障の範囲内は 0（65歳未満60万円・65歳以上110万円）", () => {
    expect(publicPensionIncome(600_000, false, 0)).toBe(0);
    expect(publicPensionIncome(1_100_000, true, 0)).toBe(0);
    expect(publicPensionIncome(1_000_000, false, 0)).toBe(400_000);
  });

  test("最低帯は定額控除から他所得区分の縮小を引く（65歳以上・年金95万円・他所得1,500万円 → 所得0）", () => {
    // 控除 = 110万円 − 10万円 = 100万円 → 収入95万円でキャップされ年金所得は 0
    expect(publicPensionIncome(950_000, true, 15_000_000)).toBe(0);
    // 65歳未満・年金50万円・他所得2,500万円 → 控除 60万 − 20万 = 40万円 → 所得10万円
    expect(publicPensionIncome(500_000, false, 25_000_000)).toBe(100_000);
  });

  test("他所得が1,000万円超・2,000万円超で控除が10万円・20万円縮小する", () => {
    // 65歳以上・年金500万円の控除は 500万×15%+685,000 = 1,435,000 が基準
    expect(publicPensionIncome(5_000_000, true, 5_000_000)).toBe(3_565_000);
    expect(publicPensionIncome(5_000_000, true, 15_000_000)).toBe(3_665_000);
    expect(publicPensionIncome(5_000_000, true, 25_000_000)).toBe(3_765_000);
  });
});

describe("手入力所得の統合計算", () => {
  test("給与＋年金で調整控除②が給与から差し引かれる", () => {
    const manual = computeManualIncomes(
      2025,
      { revenue: 5_000_000 },
      { ...EMPTY_MISC_INCOME, pensionRevenue: 3_500_000, pensionOver65: true },
      0,
    );
    // 給与所得 3,560,000、年金雑所得 2,350,000（他所得は給与のみで区分は1,000万円以下）
    expect(manual.salaryBase).toBe(3_560_000);
    expect(manual.pension).toBe(2_350_000);
    expect(manual.salaryAdjustment2).toBe(100_000);
    expect(manual.salary).toBe(3_460_000);
    expect(manual.total).toBe(5_810_000);
  });

  test("入力が空ならすべて 0", () => {
    const manual = computeManualIncomes(2025, EMPTY_SALARY_INCOME, EMPTY_MISC_INCOME, 0);
    expect(manual.total).toBe(0);
    expect(manual.miscTotal).toBe(0);
  });
});

describe("雑所得の赤字（損益通算しない）", () => {
  test("雑所得の計が赤字なら 0 で、他の所得とは通算しない（行ごとの金額は符号つき）", () => {
    const manual = computeManualIncomes(
      2025,
      EMPTY_SALARY_INCOME,
      { ...EMPTY_MISC_INCOME, businessRevenue: 100_000, businessIncome: -200_000, income: -50_000 },
      1_000_000,
    );
    expect(manual.miscBusiness).toBe(-200_000);
    expect(manual.miscOther).toBe(-50_000);
    expect(manual.miscTotal).toBe(0);
    expect(manual.total).toBe(0);
  });

  test("給与と業務の雑所得の赤字: 給与所得はそのまま残る", () => {
    const manual = computeManualIncomes(
      2025,
      { revenue: 5_000_000 },
      { ...EMPTY_MISC_INCOME, businessRevenue: 100_000, businessIncome: -1_000_000 },
      0,
    );
    expect(manual.salary).toBe(3_560_000);
    expect(manual.miscTotal).toBe(0);
    expect(manual.total).toBe(3_560_000);
  });

  test("雑所得の中では公的年金等と業務の赤字を通算する", () => {
    const manual = computeManualIncomes(
      2025,
      EMPTY_SALARY_INCOME,
      {
        ...EMPTY_MISC_INCOME,
        pensionRevenue: 1_600_000,
        pensionOver65: true,
        businessRevenue: 100_000,
        businessIncome: -200_000,
      },
      0,
    );
    // 年金所得 1,600,000 − 1,100,000 = 500,000、業務 −200,000 → 雑所得の計 300,000
    expect(manual.pension).toBe(500_000);
    expect(manual.miscTotal).toBe(300_000);
    expect(manual.total).toBe(300_000);
  });
});
