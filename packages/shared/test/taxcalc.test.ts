/**
 * taxcalc.test.ts — 税額計算の検証（bun test）。
 * 検証する主な税務ルール:
 *   (a) 簡易課税: 課税売上（税込） ¥15,000,000 → 納付税額 ¥681,818
 *   (b) 2割特例 : 同上 → ¥272,727
 *   (c) 青色申告特別控除: 不動産所得30万・事業所得500万 → 10万 + 65万 = 75万
 *   (d) 本則課税: 住宅家賃（非課税）は課税売上から除外される
 *   サンプル2024年分: 消費税3方式 本則 901,935 / 簡易 518,181 / 2割 207,272
 *   修正申告差分: 税額 +135,000
 */
import { describe, expect, test } from "bun:test";
import {
  aggregateIncome,
  amendmentDelta,
  blueDeduction,
  classifyTransactionRow,
  computeCorrectedFigures,
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

describe("消費税の素計算", () => {
  test("(a) 簡易課税 課税売上（税込）15,000,000 → 681,818", () => {
    const r = consumptionTax({ taxableSalesIncl: 15_000_000, method: "simplified" });
    expect(r.payable).toBe(681_818);
  });

  test("(a2) 売上税額は 1,363,636", () => {
    const r = consumptionTax({ taxableSalesIncl: 15_000_000, method: "simplified" });
    expect(r.outputTax).toBe(1_363_636);
  });

  test("(b) 2割特例 課税売上（税込）15,000,000 → 272,727", () => {
    const r = consumptionTax({ taxableSalesIncl: 15_000_000, method: "special20" });
    expect(r.payable).toBe(272_727);
  });

  test("本則: 1,363,636 − 100,000 = 1,263,636", () => {
    const r = consumptionTax({
      taxableSalesIncl: 15_000_000,
      inputTax: 100_000,
      method: "standard",
    });
    expect(r.payable).toBe(1_263_636);
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
    expect(r.outputTax).toBe(1_036_363);
  });

  test("集計の基本（事業所得・不動産所得）", () => {
    expect(b.businessIncome).toBe(9_850_500);
    expect(b.realEstateIncome).toBe(1_487_000);
    expect(blueDeduction(b.realEstateIncome, b.businessIncome).total).toBe(650_000);
  });

  test("消費税3方式のサンプル値（本則 901,935 / 簡易 518,181 / 2割 207,272）", () => {
    const rent = residentialRentTotal(tx2024);
    const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
    const inputTax = estimateInputTax(tx2024);
    expect(inputTax).toBe(157_318);
    expect(consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, inputTax, method: "standard" }).payable).toBe(901_935);
    expect(consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, inputTax, method: "simplified" }).payable).toBe(518_181);
    expect(consumptionTax({ taxableSalesIncl: taxable, nontaxableSalesIncl: nontaxable, inputTax, method: "special20" }).payable).toBe(207_272);
  });

  test("内部形式CSVの再パースでも件数が一致する", () => {
    expect(importCsvText(SAMPLE_CSV)).toHaveLength(54);
  });

  test("estimateInputTax は台帳の実カテゴリ名の非課税仕入を除外する (#3-5)", () => {
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
      mk("通信費", -110_000), // 課税仕入: 110,000 × 10/110 = 10,000
      mk("損害保険料", -110_000), // 非課税仕入（旧表記「保険料」では一致しなかった）
      mk("給料賃金", -110_000), // 非課税仕入（旧表記「給与賃金」では一致しなかった）
      mk("利子割引料", -110_000),
      mk("貸倒金", -110_000),
    ];
    expect(estimateInputTax(txs)).toBe(10_000);
  });

  test("estimateInputTax は収入区分 other（資金移動・私用）の出金を数えない", () => {
    const txs = normalizeTransactions([
      { date: "2025-03-05", year: 2025, description: "回線", amount: -110_000, category: "通信費", income_type: "business" },
      { date: "2025-04-01", year: 2025, description: "定期預金へ振替", amount: -1_100_000, category: "未分類", income_type: "other" },
      { date: "2025-04-02", year: 2025, description: "生活費", amount: -550_000, category: "未分類", income_type: "other" },
    ]);
    expect(estimateInputTax(txs)).toBe(10_000);
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
    expect(figures.input_tax_estimate).toBe(5_000);
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

  test("パイプライン: 消費税 本則 901,935", () => {
    expect(figs.consumption_tax_standard).toBe(901_935);
  });

  test("パイプライン: 消費税 簡易課税 518,181", () => {
    expect(figs.consumption_tax_simplified).toBe(518_181);
  });

  test("パイプライン: 消費税 2割特例 207,272", () => {
    expect(figs.consumption_tax_special20).toBe(207_272);
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
