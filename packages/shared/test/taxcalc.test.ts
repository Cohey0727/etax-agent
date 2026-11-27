/**
 * taxcalc.test.ts — 税額計算の検証（bun test）。
 * 検証する主な税務ルール:
 *   (a) 簡易課税: 課税売上（税込） ¥15,000,000 → 納付税額 ¥681,700（国税＋地方）
 *   (b) 2割特例 : 同上 → ¥272,600
 *   (c) 青色申告特別控除: 不動産所得30万・事業所得500万 → 30万 + 35万 = 65万（合算限度）
 *   (d) 本則課税: 住宅家賃（非課税）は課税売上から除外される
 *   サンプル2024年分: 消費税3方式 本則 901,700 / 簡易 518,000 / 2割 207,100
 *   修正申告差分: 税額 +135,000
 */
import { describe, expect, test } from "bun:test";
import {
  aggregateIncome,
  amendmentDelta,
  blueDeduction,
  classifyTransactionRow,
  compareConsumptionMethods,
  computeConsumptionReturn,
  computeCorrectedFigures,
  computeSimplifiedConsumptionReturn,
  computeSpecial20ConsumptionReturn,
  consumptionTax,
  estimateInputTax,
  filterYear,
  importCsvText,
  normalizeTransactions,
  residentialRentTotal,
  sampleTransactions,
  suggestCategory,
  taxableSalesFromBreakdown,
  SAMPLE_CSV,
  SAMPLE_ORIGINAL_2024,
} from "../src/index";

describe("消費税の素計算（申告書と同じ端数処理）", () => {
  test("(a) 簡易課税 課税売上（税込）15,000,000 → 国税 531,800 + 地方 149,900 = 681,700", () => {
    const r = consumptionTax({ taxableSalesIncl: 15_000_000, method: "simplified" });
    expect(r.nationalPayable).toBe(531_800);
    expect(r.localPayable).toBe(149_900);
    expect(r.payable).toBe(681_700);
  });

  test("(a2) 売上税額（国税分）は 課税標準額 13,636,000 × 7.8% = 1,063,608", () => {
    const r = consumptionTax({ taxableSalesIncl: 15_000_000, method: "simplified" });
    expect(r.outputTax).toBe(1_063_608);
  });

  test("(b) 2割特例 課税売上（税込）15,000,000 → 272,600", () => {
    const r = consumptionTax({ taxableSalesIncl: 15_000_000, method: "special20" });
    expect(r.payable).toBe(272_600);
  });

  test("本則: (1,063,608 − 100,000) → 国税 963,600 + 地方 271,700", () => {
    const r = consumptionTax({
      taxableSalesIncl: 15_000_000,
      inputTax: 100_000,
      method: "standard",
    });
    expect(r.nationalPayable).toBe(963_600);
    expect(r.localPayable).toBe(271_700);
    expect(r.payable).toBe(1_235_300);
  });

  test("本則: 仕入税額が売上税額を超えると還付（国税・地方とも端数を切り捨てない）", () => {
    const r = consumptionTax({ taxableSalesIncl: 1_100_000, inputTax: 200_000, method: "standard" });
    // 売上税額 1,000,000 × 7.8% = 78,000、控除不足 122,000、地方 122,000 × 22/78 = 34,410
    expect(r.nationalPayable).toBe(-122_000);
    expect(r.localPayable).toBe(-34_410);
    expect(r.payable).toBe(-156_410);
  });

  test("消費税申告書の計算（本則・簡易課税・2割特例）と納付税額が一致する", () => {
    for (const salesIncl10 of [1_234_567, 9_876_543, 15_000_000]) {
      const purchasesIncl10 = Math.floor(salesIncl10 / 3);
      const inputTax = Math.floor((purchasesIncl10 * 78) / 1100);
      const zero = { salesIncl8: 0, nontaxableSales: 0, exemptSales: 0, interimNational: 0, interimLocal: 0 };
      const adjustments = { returnsIncl10: 0, returnsIncl8: 0, badDebtRecoveryTax10: 0, badDebtRecoveryTax8: 0, badDebtTax10: 0, badDebtTax8: 0 };
      expect(consumptionTax({ taxableSalesIncl: salesIncl10, inputTax, method: "standard" }).payable).toBe(
        computeConsumptionReturn({ ...zero, salesIncl10, purchasesIncl10, purchasesIncl8: 0 }).totalPayable,
      );
      expect(consumptionTax({ taxableSalesIncl: salesIncl10, method: "simplified" }).payable).toBe(
        computeSimplifiedConsumptionReturn({
          ...zero,
          ...adjustments,
          salesByCategory: { 5: { incl10: salesIncl10, incl8: 0 } },
        }).totalPayable,
      );
      expect(consumptionTax({ taxableSalesIncl: salesIncl10, method: "special20" }).payable).toBe(
        computeSpecial20ConsumptionReturn({ ...zero, ...adjustments, salesIncl10 }).totalPayable,
      );
    }
  });
});

describe("小規模事業者の特例（2割特例・3割特例）と簡易課税の事業区分", () => {
  const sales = normalizeTransactions([
    { date: "2026-03-01", year: 2026, description: "売上", amount: 15_000_000, category: "売上高", income_type: "business" },
  ]);
  const at = (year: number) => sales.map((t) => ({ ...t, year, date: `${year}-03-01` }));

  test("令和8年分までは2割特例（納付税額 = 売上税額 × 20%）", () => {
    const figures = computeCorrectedFigures(at(2026), 2026);
    expect(figures.consumption_tax_special20).toBe(272_600);
    expect(figures._detail.small_business_special_rate).toBe(0.2);
  });

  test("令和9年分は個人事業者の3割特例（納付税額 = 売上税額 × 30%）", () => {
    const figures = computeCorrectedFigures(at(2027), 2027);
    // 売上税額 1,063,608 − 控除 744,525 = 319,083 → 国税 319,000 + 地方 89,900
    expect(figures.consumption_tax_special20).toBe(408_900);
    expect(figures._detail.small_business_special_rate).toBe(0.3);
  });

  test("特例の無い年分は 0 で、特例の率は null", () => {
    const figures = computeCorrectedFigures(at(2022), 2022);
    expect(figures.consumption_tax_special20).toBe(0);
    expect(figures._detail.small_business_special_rate).toBeNull();
  });

  test("簡易課税は事業区分のみなし仕入率で計算する（既定は第5種）", () => {
    const services = computeCorrectedFigures(at(2026), 2026);
    const retail = computeCorrectedFigures(at(2026), 2026, { businessKind: "retail" });
    expect(services.consumption_tax_simplified).toBe(681_700);
    expect(retail.consumption_tax_simplified).toBe(
      consumptionTax({ taxableSalesIncl: 15_000_000, method: "simplified", businessKind: "retail" }).payable,
    );
    expect(retail.consumption_tax_simplified).toBeLessThan(services.consumption_tax_simplified);
  });
});

describe("compareConsumptionMethods（3方式の比較）", () => {
  const tx = (year: number) =>
    normalizeTransactions([
      { date: `${year}-03-01`, year, description: "売上", amount: 11_000_000, category: "売上高", income_type: "business" },
      { date: `${year}-04-01`, year, description: "家賃", amount: 9_000_000, category: "家賃収入", income_type: "real_estate" },
      { date: `${year}-05-01`, year, description: "仕入", amount: -5_500_000, category: "仕入高", income_type: "business" },
    ]);

  test("computeCorrectedFigures の3方式の納付税額と同じ結果を、国税分・地方分つきで返す", () => {
    const comparison = compareConsumptionMethods(tx(2026), 2026, "retail");
    const figures = computeCorrectedFigures(tx(2026), 2026, { businessKind: "retail" });
    expect(comparison.standard.payable).toBe(figures.consumption_tax_standard);
    expect(comparison.simplified.payable).toBe(figures.consumption_tax_simplified);
    expect(comparison.special?.payable).toBe(figures.consumption_tax_special20);
    for (const r of [comparison.standard, comparison.simplified, comparison.special!]) {
      expect(r.nationalPayable + r.localPayable).toBe(r.payable);
    }
    expect(comparison.simplified.detail.deemed_purchase_rate).toBe(0.8);
  });

  test("本則は課税売上割合が95%未満なら仕入税額を按分する", () => {
    const comparison = compareConsumptionMethods(tx(2026), 2026);
    // 課税売上（税抜）10,000,000・非課税売上（住宅家賃）9,000,000 → 課税売上割合 52.63%
    expect(comparison.nontaxableSalesIncl).toBe(9_000_000);
    expect(comparison.standard.detail.taxable_sales_ratio_percent).toBe(52.63);
    expect(comparison.standard.inputTax).toBe(Math.floor((comparison.inputTaxEstimate * 52.63) / 100));
    expect(comparison.standard.inputTax).toBeLessThan(comparison.inputTaxEstimate);
  });

  test("令和9年分は3割特例、特例の無い年分は special が null", () => {
    expect(compareConsumptionMethods(tx(2027), 2027).special?.detail.special_rate).toBe(0.3);
    expect(compareConsumptionMethods(tx(2027), 2027).smallBusinessSpecialRate).toBe(0.3);
    const none = compareConsumptionMethods(tx(2022), 2022);
    expect(none.special).toBeNull();
    expect(none.smallBusinessSpecialRate).toBeNull();
  });
});

describe("青色申告特別控除の振り分け", () => {
  // No.2072: 65万円控除は不動産＋事業の合計額が限度（不動産→事業の順に控除）
  test("(c) 不動産30万・事業500万 → 300,000 + 350,000 = 650,000", () => {
    const blue = blueDeduction(300_000, 5_000_000);
    expect(blue.realEstate).toBe(300_000);
    expect(blue.business).toBe(350_000);
    expect(blue.total).toBe(650_000);
  });

  test("控除は所得が上限（不動産5万・事業0）", () => {
    const blue = blueDeduction(50_000, -10_000);
    expect(blue.realEstate).toBe(50_000);
    expect(blue.business).toBe(0);
  });

  // 順序依存ケース: 合算限度65万円を不動産から先に使い切る
  test("順序(i) 不動産30万・事業60万 → 300,000 + 350,000 = 650,000", () => {
    const blue = blueDeduction(300_000, 600_000);
    expect(blue.realEstate).toBe(300_000);
    expect(blue.business).toBe(350_000);
    expect(blue.total).toBe(650_000);
  });

  test("順序(ii) 不動産5万・事業500万 → 50,000 + 600,000 = 650,000", () => {
    const blue = blueDeduction(50_000, 5_000_000);
    expect(blue.realEstate).toBe(50_000);
    expect(blue.business).toBe(600_000);
    expect(blue.total).toBe(650_000);
  });

  test("順序(iii) 不動産30万・事業70万 → 合計ちょうど 650,000", () => {
    const blue = blueDeduction(300_000, 700_000);
    expect(blue.realEstate).toBe(300_000);
    expect(blue.business).toBe(350_000);
    expect(blue.total).toBe(650_000);
  });

  test("不動産のみ・事業的規模でない → 10万円が限度", () => {
    const blue = blueDeduction(5_000_000, 0);
    expect(blue.realEstate).toBe(100_000);
    expect(blue.business).toBe(0);
    expect(blue.total).toBe(100_000);
  });

  test("事業を営んでいれば、事業所得が赤字でも不動産から65万円まで控除する（No.2072）", () => {
    const blue = blueDeduction(1_000_000, -200_000, { filingType: "blue65", operatesBusiness: true });
    expect(blue.realEstate).toBe(650_000);
    expect(blue.business).toBe(0);
    expect(blue.total).toBe(650_000);
  });

  test("事業を営んでいなければ、不動産のみ（事業的規模でない）は10万円が限度", () => {
    const blue = blueDeduction(1_000_000, 0, { filingType: "blue65", operatesBusiness: false });
    expect(blue.total).toBe(100_000);
  });

  test("修正後の数値: 事業の取引があれば事業所得が赤字でも65万円の限度", () => {
    const figures = computeCorrectedFigures(
      normalizeTransactions([
        { date: "2025-03-01", year: 2025, description: "家賃", amount: 1_000_000, category: "家賃収入", income_type: "real_estate" },
        { date: "2025-03-05", year: 2025, description: "回線", amount: -200_000, category: "通信費", income_type: "business" },
      ]),
      2025,
    );
    expect(figures._detail.blue_deduction_real_estate).toBe(650_000);
    expect(figures.blue_deduction).toBe(650_000);
  });

  test("順序(iv) 赤字の区分は控除ゼロ（不動産赤字・事業黒字）", () => {
    const blue = blueDeduction(-100_000, 800_000);
    expect(blue.realEstate).toBe(0);
    expect(blue.business).toBe(650_000);
  });

  test("順序(iv) 両区分赤字 → 合計 0", () => {
    expect(blueDeduction(-1, -1).total).toBe(0);
  });

  test("青色55万円 → 合算に55万円まで（不動産から先に控除）", () => {
    const blue = blueDeduction(300_000, 5_000_000, { filingType: "blue55" });
    expect(blue.realEstate).toBe(300_000);
    expect(blue.business).toBe(250_000);
    expect(blue.total).toBe(550_000);
  });

  test("白色申告 → 控除なし", () => {
    const blue = blueDeduction(300_000, 5_000_000, { filingType: "white" });
    expect(blue.total).toBe(0);
  });

  test("青色10万円 → 事業・不動産の合算に10万円まで（不動産から先に控除）", () => {
    const blue = blueDeduction(300_000, 5_000_000, { filingType: "blue10" });
    expect(blue.realEstate).toBe(100_000);
    expect(blue.business).toBe(0);
    expect(blue.total).toBe(100_000);
    const blue2 = blueDeduction(30_000, 5_000_000, { filingType: "blue10" });
    expect(blue2.realEstate).toBe(30_000);
    expect(blue2.business).toBe(70_000);
    expect(blue2.total).toBe(100_000);
  });

  test("不動産が事業的規模（青色65万円）→ 合算に65万円まで", () => {
    const blue = blueDeduction(300_000, 5_000_000, {
      filingType: "blue65",
      realEstateBusinessScale: true,
    });
    expect(blue.realEstate).toBe(300_000);
    expect(blue.business).toBe(350_000);
    expect(blue.total).toBe(650_000);
  });
});

describe("サンプルCSV（2024年分）", () => {
  const tx2024 = filterYear(sampleTransactions(), 2024);
  const b = aggregateIncome(tx2024);

  test("(d) 家賃収入 1,764,000 が非課税売上・課税売上は事業収入のみ", () => {
    const rent = residentialRentTotal(tx2024);
    const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
    expect(nontaxable).toBe(1_764_000);
    expect(taxable).toBe(11_400_000);
    const r = consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, method: "standard", inputTax: estimateInputTax(tx2024) });
    expect(r.outputTax).toBe(808_314);
  });

  test("集計の基本（事業所得・不動産所得）", () => {
    expect(b.businessIncome).toBe(9_850_500);
    expect(b.realEstateIncome).toBe(1_487_000);
    expect(blueDeduction(b.realEstateIncome, b.businessIncome).total).toBe(650_000);
  });

  test("消費税3方式のサンプル値（本則 901,700 / 簡易 518,000 / 2割 207,100）", () => {
    const rent = residentialRentTotal(tx2024);
    const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
    const inputTax = estimateInputTax(tx2024);
    expect(inputTax).toBe(122_708);
    expect(consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, inputTax, method: "standard" }).payable).toBe(901_700);
    expect(consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, inputTax, method: "simplified" }).payable).toBe(518_000);
    expect(consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, inputTax, method: "special20" }).payable).toBe(207_100);
  });

  test("内部形式CSVの再パースでも件数が一致する", () => {
    expect(importCsvText(SAMPLE_CSV)).toHaveLength(54);
  });

  test("estimateInputTax は台帳の実カテゴリ名の非課税仕入を除外する", () => {
    const mk = (category: string, amount: number) => ({
      date: "2024-06-15",
      year: 2024,
      description: "テスト",
      amount,
      account: "普通預金",
      category,
      income_type: "business" as const,
      tax_category: "",
    });
    const txs = [
      mk("通信費", -110_000), // 課税仕入: 110,000 × 7.8/110 = 7,800
      mk("損害保険料", -110_000), // 非課税仕入
      mk("給料賃金", -110_000), // 非課税仕入
      mk("利子割引料", -110_000),
      mk("貸倒金", -110_000),
    ];
    expect(estimateInputTax(txs)).toBe(7_800);
  });

  test("estimateInputTax は収入区分 other（資金移動・私用）の出金を数えない", () => {
    const txs = normalizeTransactions([
      { date: "2025-03-05", year: 2025, description: "回線", amount: -110_000, category: "通信費", income_type: "business" },
      { date: "2025-04-01", year: 2025, description: "定期預金へ振替", amount: -1_100_000, category: "未分類", income_type: "other" },
      { date: "2025-04-02", year: 2025, description: "生活費", amount: -550_000, category: "未分類", income_type: "other" },
    ]);
    expect(estimateInputTax(txs)).toBe(7_800);
  });

  test("経費の返金は課税売上ではなく仕入の減額として扱う", () => {
    const figures = computeCorrectedFigures(
      normalizeTransactions([
        { date: "2025-03-01", year: 2025, description: "売上", amount: 1_100_000, category: "売上高", income_type: "business" },
        { date: "2025-03-05", year: 2025, description: "回線", amount: -110_000, category: "通信費", income_type: "business" },
        { date: "2025-03-20", year: 2025, description: "回線 返金", amount: 55_000, category: "通信費", income_type: "business" },
      ]),
      2025,
    );
    expect(figures.business_revenue).toBe(1_100_000);
    expect(figures.business_expenses).toBe(55_000);
    expect(figures.taxable_sales).toBe(1_100_000);
    expect(figures.input_tax_estimate).toBe(3_900);
  });

  test("家賃収入の返金は住宅家賃（非課税売上）を減らし、課税売上を負にしない", () => {
    const txs = normalizeTransactions([
      { date: "2025-03-01", year: 2025, description: "家賃", amount: 100_000, category: "家賃収入", income_type: "real_estate" },
      { date: "2025-03-02", year: 2025, description: "家賃 日割り返金", amount: -10_000, category: "家賃収入", income_type: "real_estate" },
    ]);
    expect(residentialRentTotal(txs)).toBe(90_000);
    const figures = computeCorrectedFigures(txs, 2025);
    expect(figures.taxable_sales).toBe(0);
    expect(figures.nontaxable_sales).toBe(90_000);
  });

  test("本則: 課税売上割合が95%未満なら仕入税額を一括比例配分で按分する", () => {
    // 課税売上 11,000,000（税抜 10,000,000）・非課税売上 1,000,000 → 割合 90.90%
    const r = consumptionTax({
      taxableSalesIncl: 11_000_000,
      nontaxableSalesIncl: 1_000_000,
      inputTax: 100_000,
      method: "standard",
    });
    expect(r.inputTax).toBe(90_900);
  });

  test("本則: 課税売上割合が95%以上なら仕入税額は全額控除", () => {
    // 税抜 10,000,000・非課税 500,000 → 割合 95.23%
    const r = consumptionTax({
      taxableSalesIncl: 11_000_000,
      nontaxableSalesIncl: 500_000,
      inputTax: 100_000,
      method: "standard",
    });
    expect(r.inputTax).toBe(100_000);
  });
});

describe("ルールによる科目推定", () => {
  test("摘要『AWS 利用料』→ 通信費", () => {
    expect(suggestCategory("AWS 利用料")).toBe("通信費");
  });
  test("摘要『Mac mini 購入』→ 消耗品費", () => {
    expect(suggestCategory("Mac mini 購入")).toBe("消耗品費");
  });
});

describe("行の分類（classifyTransactionRow）", () => {
  test("明示の勘定科目・収入区分が推定より優先される（技術書籍の行）", () => {
    const r = classifyTransactionRow({
      description: "技術書籍",
      category: "新聞図書費",
      incomeType: "business",
    });
    expect(r.category).toBe("新聞図書費");
    expect(r.income_type).toBe("business");
  });

  test("明示の勘定科目はキーワード推定より優先される", () => {
    const r = classifyTransactionRow({
      description: "AWS 利用料",
      category: "新聞図書費",
      incomeType: "business",
    });
    expect(r.category).toBe("新聞図書費");
  });

  test("勘定科目が空欄で推定できなければ未分類、収入区分の列が無ければ区分推定で other", () => {
    const r = classifyTransactionRow({ description: "技術書籍", category: "", incomeType: null });
    expect(r.category).toBe("未分類");
    expect(r.income_type).toBe("other");
  });

  test("収入区分の列自体が無い場合は区分推定（家賃まわりは不動産所得）", () => {
    const r = classifyTransactionRow({ description: "賃貸管理費", category: null, incomeType: null });
    expect(r.category).toBe("管理費");
    expect(r.income_type).toBe("real_estate");
  });

  test("科目が地代家賃（家賃の支払い）なら摘要に「家賃」があっても事業所得", () => {
    const r = classifyTransactionRow({ description: "事務所家賃 6月分", category: "地代家賃", incomeType: null });
    expect(r.income_type).toBe("business");
  });

  test("収入区分が空欄なら other、不正な値なら Error", () => {
    expect(
      classifyTransactionRow({ description: "AWS 利用料", category: "", incomeType: "" })
        .income_type,
    ).toBe("other");
    expect(() =>
      classifyTransactionRow({ description: "x", category: "", incomeType: "biz" }),
    ).toThrow("income_type が不正です");
  });

  test("取込: サンプルCSVの技術書籍の行は 新聞図書費 / business になる", () => {
    const tx = importCsvText(SAMPLE_CSV).find((t) => t.date === "2024-07-20");
    expect(tx?.category).toBe("新聞図書費");
    expect(tx?.income_type).toBe("business");
  });
});

describe("修正申告の差分", () => {
  const orig = {
    year: 2024,
    business_revenue: 13_164_000,
    real_estate_revenue: 0,
    housing_loan_credit: 150_000,
    income_tax: 1_480_000,
  };
  const corr = {
    year: 2024,
    business_revenue: 11_400_000,
    real_estate_revenue: 1_764_000,
    housing_loan_credit: 0,
    income_tax: 1_615_000,
  };

  test("家賃収入 +1,764,000", () => {
    const d = amendmentDelta(orig, corr);
    expect(d.fieldDiffs["real_estate_revenue"]?.diff).toBe(1_764_000);
  });

  test("税額 +135,000", () => {
    const d = amendmentDelta(orig, corr);
    expect(d.taxDelta).toBe(135_000);
  });
});

describe("修正パイプライン（computeCorrectedFigures）", () => {
  const tx2024 = filterYear(sampleTransactions(), 2024);
  const figs = computeCorrectedFigures(tx2024, 2024);

  test("パイプライン: 事業収入 11,400,000", () => {
    expect(figs.business_revenue).toBe(11_400_000);
  });

  test("パイプライン: 不動産収入 1,764,000", () => {
    expect(figs.real_estate_revenue).toBe(1_764_000);
  });

  test("パイプライン: 青色控除 650,000", () => {
    expect(figs.blue_deduction).toBe(650_000);
  });

  test("パイプライン: 課税売上 11,400,000・非課税 1,764,000", () => {
    expect(figs.taxable_sales).toBe(11_400_000);
    expect(figs.nontaxable_sales).toBe(1_764_000);
  });

  test("パイプライン: 消費税 本則 901,700", () => {
    expect(figs.consumption_tax_standard).toBe(901_700);
  });

  test("パイプライン: 消費税 簡易課税 518,000", () => {
    expect(figs.consumption_tax_simplified).toBe(518_000);
  });

  test("パイプライン: 消費税 2割特例 207,100", () => {
    expect(figs.consumption_tax_special20).toBe(207_100);
  });

  test("パイプライン: 控除後所得 事業 9,850,500・不動産 837,000", () => {
    // 青色控除65万円は不動産から先に控除する（No.2072）
    expect(figs._detail.business_income).toBe(9_850_500);
    expect(figs._detail.real_estate_income).toBe(837_000);
  });

  test("パイプライン差分: 事業収入 -1,764,000", () => {
    const d = amendmentDelta(SAMPLE_ORIGINAL_2024, figs);
    expect(d.fieldDiffs["business_revenue"]?.diff).toBe(-1_764_000);
  });

  test("パイプライン差分: 青色控除は差分なし（修正後も合算限度65万円）", () => {
    const d = amendmentDelta(SAMPLE_ORIGINAL_2024, figs);
    expect(d.fieldDiffs["blue_deduction"]).toBeUndefined();
  });

  test("パイプライン: 取引から計算できない項目（income_tax 等）は含まない（引き継ぎ前提）", () => {
    expect("income_tax" in figs).toBe(false);
    expect("housing_loan_credit" in figs).toBe(false);
  });
});
