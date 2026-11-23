/**
 * salary.test.ts — 給与所得の金額・給与所得控除額の検証（No.1410）。
 * 年度ごとの段階表は taxParameters（TAX_PARAMETERS）が持つ。
 */
import { describe, expect, test } from "bun:test";
import { salaryDeductionAmount, salaryIncomeAmount } from "../src/deductions";

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
