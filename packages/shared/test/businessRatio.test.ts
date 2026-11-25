import { describe, expect, test } from "bun:test";
import {
  BUSINESS_PORTION_ROUNDING,
  Transaction,
  aggregateIncome,
  buildTrialBalance,
  businessPortionAmount,
  computeCorrectedFigures,
  estimateInputTax,
  normalizeTransaction,
  statementCategoryTotals,
  summarizeConsumptionTax,
  transactionBusinessAmount,
} from "../src";

function tx(partial: Partial<Transaction>): Transaction {
  return {
    date: "2025-06-15",
    year: 2025,
    description: "テスト",
    amount: 0,
    account: "普通預金",
    category: "未分類",
    income_type: "business",
    tax_category: "",
    ...partial,
  };
}

describe("businessPortionAmount（端数処理の一貫性）", () => {
  test("端数処理方式は定数で切り捨てに固定されている", () => {
    expect(BUSINESS_PORTION_ROUNDING).toBe("truncate");
  });

  test("取引単位で絶対値を切り捨てる（端数は私用分に寄る）", () => {
    expect(businessPortionAmount(10_001, 50)).toBe(5_000);
    expect(businessPortionAmount(-10_001, 50)).toBe(-5_000);
    expect(businessPortionAmount(9_999, 33)).toBe(3_299);
    expect(businessPortionAmount(-9_999, 33)).toBe(-3_299);
    expect(businessPortionAmount(101, 99)).toBe(99);
  });

  test("割合100はそのまま、割合0は0、不正な割合は100として扱う", () => {
    expect(businessPortionAmount(12_345, 100)).toBe(12_345);
    expect(businessPortionAmount(-12_345, 100)).toBe(-12_345);
    expect(businessPortionAmount(12_345, 0)).toBe(0);
    expect(businessPortionAmount(12_345, Number.NaN)).toBe(12_345);
    expect(businessPortionAmount(12_345, 150)).toBe(12_345);
    expect(businessPortionAmount(12_345, -10)).toBe(0);
  });

  test("事業分は元の金額を超えず符号を保ち、私用分（残差）と合計が元金額になる", () => {
    for (const amount of [10_001, -9_999, 123_456, -7]) {
      for (const ratio of [1, 33, 50, 99]) {
        const business = businessPortionAmount(amount, ratio);
        expect(Math.abs(business)).toBeLessThanOrEqual(Math.abs(amount));
        // 切り捨てで0になる場合を除き、符号は元の金額と一致する
        expect(business === 0 || Math.sign(business) === Math.sign(amount)).toBe(true);
        const personal = amount - business;
        expect(business + personal).toBe(amount);
        expect(Math.sign(personal) === 0 || Math.sign(personal) === Math.sign(amount)).toBe(true);
      }
    }
  });

  test("transactionBusinessAmount は未指定を100として扱う", () => {
    expect(transactionBusinessAmount(tx({ amount: -10_000 }))).toBe(-10_000);
    expect(transactionBusinessAmount(tx({ amount: -10_000, business_ratio_percent: 100 }))).toBe(-10_000);
    expect(transactionBusinessAmount(tx({ amount: -10_000, business_ratio_percent: 30 }))).toBe(-3_000);
  });
});

describe("集計への反映", () => {
  const TRANSACTIONS: Transaction[] = [
    tx({ date: "2025-01-15", description: "売上", amount: 2_200_000, category: "売上高" }),
    tx({ description: "家賃", amount: -1_200_000, category: "地代家賃", business_ratio_percent: 50, business_ratio_basis: "面積割合" }),
    tx({ description: "通信費", amount: -110_000, category: "通信費" }),
    tx({ description: "家賃収入", amount: 147_000, category: "家賃収入", income_type: "real_estate" }),
    tx({ description: "固定資産税", amount: -50_000, category: "租税公課", income_type: "real_estate", business_ratio_percent: 80 }),
  ];

  test("所得集計は事業分だけを収入・経費に算入する", () => {
    const b = aggregateIncome(TRANSACTIONS);
    expect(b.businessRevenue).toBe(2_200_000);
    expect(b.businessExpenses).toBe(600_000 + 110_000);
    expect(b.realEstateRevenue).toBe(147_000);
    expect(b.realEstateExpenses).toBe(40_000);
  });

  test("決算書の科目別集計（statementCategoryTotals）は事業分で計算される", () => {
    const totals = statementCategoryTotals(TRANSACTIONS, "business");
    expect(totals["地代家賃"]).toBe(600_000);
    expect(totals["通信費"]).toBe(110_000);
    const realEstate = statementCategoryTotals(TRANSACTIONS, "real_estate");
    expect(realEstate["租税公課"]).toBe(40_000);
  });

  test("試算表のPL内訳と月次推移が決算の数値（事業分）と一致する", () => {
    const tb = buildTrialBalance(TRANSACTIONS, 2025);
    const figures = computeCorrectedFigures(TRANSACTIONS, 2025);
    expect(tb.business.expenses).toBe(figures.business_expenses);
    expect(tb.business.revenue).toBe(figures.business_revenue);
    const rentLine = tb.business.expense_lines.find((line) => line.category === "地代家賃");
    expect(rentLine?.amount).toBe(600_000);
    const june = tb.monthly.find((row) => row.month === 6);
    // 6月の取引は家賃・通信費・家賃収入・固定資産税（事業+不動産の事業分）
    expect(june?.expenses).toBe(600_000 + 110_000 + 40_000);
  });

  test("ratio=100 の明示と未指定で結果が変わらない（回帰）", () => {
    const plain: Transaction[] = TRANSACTIONS.map((t) => {
      const copy = { ...t };
      delete copy.business_ratio_percent;
      delete copy.business_ratio_basis;
      return copy;
    });
    // 按分なしでは家賃は全額が経費になる（従来どおり）
    const plainFigures = computeCorrectedFigures(plain, 2025);
    expect(plainFigures.business_expenses).toBe(1_200_000 + 110_000);
    expect(plainFigures.real_estate_expenses).toBe(50_000);
    // ratio=100 を明示したデータは未指定と完全に一致する
    const explicit: Transaction[] = plain.map((t) => ({ ...t, business_ratio_percent: 100 }));
    expect(computeCorrectedFigures(explicit, 2025)).toEqual(plainFigures);
    expect(buildTrialBalance(explicit, 2025)).toEqual(buildTrialBalance(plain, 2025));
  });
});

describe("消費税への反映", () => {
  const withRatio = (ratio: number): Transaction[] => [
    tx({ date: "2025-03-01", description: "売上", amount: 1_100_000, category: "売上高" }),
    tx({ description: "通信費", amount: -110_000, category: "通信費", business_ratio_percent: ratio }),
  ];

  test("仕入税額控除の概算（本則）は按分後の事業分が母数になる", () => {
    // 事業分 55,000 × 10/110 = 5,000
    expect(estimateInputTax(withRatio(50))).toBe(5_000);
    // 按分なし（全額事業分）: 110,000 × 10/110 = 10,000
    expect(estimateInputTax(withRatio(100))).toBe(10_000);
  });

  test("本則の納付税額は按分で変わり、簡易課税・2割特例は按分の影響を受けない", () => {
    const half = computeCorrectedFigures(withRatio(50), 2025);
    const full = computeCorrectedFigures(withRatio(100), 2025);
    // 売上税額 100,000 − 仕入税額（5,000 / 10,000）
    expect(half.consumption_tax_standard).toBe(95_000);
    expect(full.consumption_tax_standard).toBe(90_000);
    // 簡易・2割特例は売上税額だけから決まるため、経費の按分では変わらない
    expect(half.consumption_tax_simplified).toBe(full.consumption_tax_simplified);
    expect(half.consumption_tax_special20).toBe(full.consumption_tax_special20);
    expect(half.consumption_tax_special20).toBe(20_000);
  });

  test("消費税本則の税区分集計（summarizeConsumptionTax）も課税仕入は事業分だけ", () => {
    const summary = summarizeConsumptionTax(
      [
        tx({ description: "仕入", amount: -110_000, category: "通信費", tax_category: "課対仕入10%", business_ratio_percent: 50 }),
        tx({ description: "売上", amount: 1_100_000, category: "売上高", tax_category: "課税売上10%" }),
      ],
      2025,
    );
    expect(summary.purchasesIncl10).toBe(55_000);
    expect(summary.salesIncl10).toBe(1_100_000);
  });
});

describe("normalizeTransaction の引き継ぎ", () => {
  test("事業割合と按分根拠を引き継ぎ、不正値は未指定にする", () => {
    const ok = normalizeTransaction({
      date: "2025-01-01",
      amount: -10_000,
      business_ratio_percent: 50,
      business_ratio_basis: "面積割合 20㎡/60㎡",
    });
    expect(ok.business_ratio_percent).toBe(50);
    expect(ok.business_ratio_basis).toBe("面積割合 20㎡/60㎡");

    const bad = normalizeTransaction({
      date: "2025-01-01",
      amount: -10_000,
      business_ratio_percent: "50",
    });
    expect(bad.business_ratio_percent).toBeUndefined();

    const over = normalizeTransaction({
      date: "2025-01-01",
      amount: -10_000,
      business_ratio_percent: 150,
    });
    expect(over.business_ratio_percent).toBe(100);
  });
});
