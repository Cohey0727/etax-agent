/**
 * dashboard.test.ts — ダッシュボードの数値（所得の内訳・青色申告特別控除・
 * 消費税3方式の比較・勘定科目ごとの内訳・年ごとの推移）の検証。
 */
import { describe, expect, test } from "bun:test";
import { EMPTY_AGRICULTURE_INPUT } from "../src/agriculture";
import {
  categoryBreakdown,
  dashboardFigures,
  smallBusinessSpecialLabel,
  yearlyIncomeTotals,
} from "../src/dashboard";
import { filterYear, importCsvText } from "../src/ledger";
import { computeCorrectedFigures } from "../src/taxcalc";
import { sampleTransactions } from "../src/sample";

const csv = (lines: string[]) =>
  importCsvText(["date,description,amount,account,category,income_type", ...lines].join("\n"));

describe("dashboardFigures", () => {
  test("消費税3方式と青色申告特別控除が修正後の申告数値と一致する", () => {
    const tx = filterYear(sampleTransactions(), 2024);
    const figures = dashboardFigures(tx, 2024, { filingType: "blue65" });
    const corrected = computeCorrectedFigures(tx, 2024, { filingType: "blue65" });
    expect(figures.consumption.map((row) => [row.method, row.payable])).toEqual([
      ["standard", corrected.consumption_tax_standard],
      ["simplified", corrected.consumption_tax_simplified],
      ["special20", corrected.consumption_tax_special20],
    ]);
    expect(figures.taxableSalesIncl).toBe(corrected.taxable_sales);
    expect(figures.nontaxableSalesIncl).toBe(corrected.nontaxable_sales);
    expect(figures.inputTaxEstimate).toBe(corrected.input_tax_estimate);
    expect(figures.blue.total).toBe(corrected.blue_deduction);
  });

  test("申告入力の農業所得を青色申告特別控除の配分に入れ、確定申告の計算と一致させる", () => {
    const tx = csv(["2025-04-01,家賃,1200000,口座,家賃収入,real_estate"]);
    const agriculture = { ...EMPTY_AGRICULTURE_INPUT, salesAmount: 800_000 };
    const options = { filingType: "blue65" as const, agriculture };
    const figures = dashboardFigures(tx, 2025, options);
    const corrected = computeCorrectedFigures(tx, 2025, options);
    // 事業的規模でない不動産所得だけなら上限は10万円だが、農業所得があるので65万円まで。
    expect(figures.blue).toEqual({
      realEstate: corrected._detail.blue_deduction_real_estate,
      business: corrected._detail.blue_deduction_business,
      agriculture: corrected._detail.blue_deduction_agriculture,
      total: corrected.blue_deduction,
    });
    expect(figures.blue.realEstate).toBe(650_000);
  });

  test("年分の特例の率で特例の行を出す（令和9年分は3割特例）", () => {
    const tx = csv([
      "2027-03-01,報酬,5500000,口座,売上高,business",
      "2027-04-01,AWS,-110000,カード,通信費,business",
    ]);
    const figures = dashboardFigures(tx, 2027, { filingType: "blue65" });
    const corrected = computeCorrectedFigures(tx, 2027, { filingType: "blue65" });
    expect(figures.smallBusinessSpecialRate).toBe(0.3);
    expect(figures.consumption.map((row) => [row.method, row.payable])).toEqual([
      ["standard", corrected.consumption_tax_standard],
      ["simplified", corrected.consumption_tax_simplified],
      ["special20", corrected.consumption_tax_special20],
    ]);
  });

  test("特例の無い年分は特例の行を出さない", () => {
    const tx = csv(["2020-03-01,報酬,5500000,口座,売上高,business"]);
    const figures = dashboardFigures(tx, 2020, { filingType: "blue65" });
    expect(figures.smallBusinessSpecialRate).toBeNull();
    expect(figures.consumption.map((row) => row.method)).toEqual(["standard", "simplified"]);
  });

  test("課税売上割合が95%未満なら本則課税の仕入税額を按分し、確定申告の計算と一致させる", () => {
    const tx = csv([
      "2025-03-01,報酬,1100000,口座,売上高,business",
      "2025-04-01,外注,-550000,口座,外注費,business",
      "2025-05-01,家賃,3000000,口座,家賃収入,real_estate",
    ]);
    const figures = dashboardFigures(tx, 2025, { filingType: "blue65" });
    const corrected = computeCorrectedFigures(tx, 2025, { filingType: "blue65" });
    const [standard] = figures.consumption;
    expect(standard?.payable).toBe(corrected.consumption_tax_standard);
    expect(standard!.inputTax).toBeLessThan(figures.inputTaxEstimate);
  });

  test("各行の納付税額は国税（差引税額）と地方消費税（譲渡割額）の合計", () => {
    const tx = filterYear(sampleTransactions(), 2024);
    for (const row of dashboardFigures(tx, 2024, { filingType: "blue65" }).consumption) {
      expect(row.nationalPayable + row.localPayable).toBe(row.payable);
    }
  });
});

describe("dashboardFigures の青色申告特別控除の限度額", () => {
  const rentOnly = csv(["2025-04-01,家賃,3000000,口座,家賃収入,real_estate"]);
  const withBusiness = csv([
    "2025-04-01,家賃,3000000,口座,家賃収入,real_estate",
    "2025-05-01,AWS,-30000,カード,通信費,business",
  ]);
  const limit = (tx: ReturnType<typeof csv>, options: Parameters<typeof dashboardFigures>[2]) =>
    dashboardFigures(tx, 2025, options).blueDeductionLimit;

  test("事業を営んでおらず不動産が事業的規模でなければ10万円", () => {
    expect(limit(rentOnly, { filingType: "blue65" })).toBe(100_000);
  });

  test("事業を営んでいれば（事業所得が赤字でも）申告の種類の限度額", () => {
    expect(limit(withBusiness, { filingType: "blue65" })).toBe(650_000);
    expect(limit(withBusiness, { filingType: "blue55" })).toBe(550_000);
  });

  test("不動産が事業的規模なら申告の種類の限度額。10万円控除・白色はその額", () => {
    expect(limit(rentOnly, { filingType: "blue65", realEstateBusinessScale: true })).toBe(650_000);
    expect(limit(withBusiness, { filingType: "blue10" })).toBe(100_000);
    expect(limit(withBusiness, { filingType: "white" })).toBe(0);
  });

  test("農業所得の入力があれば事業を営んでいる側として扱う", () => {
    const agriculture = { ...EMPTY_AGRICULTURE_INPUT, salesAmount: 800_000 };
    expect(limit(rentOnly, { filingType: "blue65", agriculture })).toBe(650_000);
  });
});

describe("categoryBreakdown", () => {
  test("事業分を科目ごとに金額の大きい順で積み、その他区分は含めない", () => {
    const tx = csv([
      "2025-01-10,AWS,-30000,カード,通信費,business",
      "2025-01-11,回線,-10000,カード,通信費,business",
      "2025-01-12,本,-5000,カード,新聞図書費,business",
      "2025-01-13,チャージ,-90000,カード,未分類,other",
      "2025-01-14,報酬,500000,口座,売上高,business",
    ]);
    const expenses = categoryBreakdown(tx, "expense");
    expect(expenses.rows).toEqual([
      { category: "通信費", amount: 40000 },
      { category: "新聞図書費", amount: 5000 },
    ]);
    expect(expenses.total).toBe(45000);
    expect(expenses.slices.map((s) => [s.category, s.colorIndex])).toEqual([
      ["通信費", 5],
      ["新聞図書費", 0],
    ]);
    expect(categoryBreakdown(tx, "income").rows).toEqual([{ category: "売上高", amount: 500000 }]);
  });

  test("7科目以上は上位5科目と「その他」にまとめ、その他は灰色", () => {
    const tx = csv(
      ["A", "B", "C", "D", "E", "F", "G"].map(
        (name, i) => `2025-02-0${i + 1},${name},-${(7 - i) * 1000},カード,科目${name},business`,
      ),
    );
    const { slices } = categoryBreakdown(tx, "expense");
    expect(slices.map((s) => [s.category, s.amount])).toEqual([
      ["科目A", 7000],
      ["科目B", 6000],
      ["科目C", 5000],
      ["科目D", 4000],
      ["科目E", 3000],
      ["その他", 3000],
    ]);
    expect(slices[5]?.colorIndex).toBeNull();
  });

  test("勘定科目「その他」がある場合も、まとめの「その他」と重ならず1つになる", () => {
    const tx = csv(
      ["A", "B", "C", "D", "E", "F"].map(
        (name, i) => `2025-03-0${i + 1},${name},-${(10 - i) * 1000},カード,科目${name},business`,
      ).concat(["2025-03-09,雑多な支出,-9500,カード,その他,business"]),
    );
    const { slices } = categoryBreakdown(tx, "expense");
    expect(slices.map((s) => [s.category, s.amount])).toEqual([
      ["科目A", 10000],
      ["科目B", 9000],
      ["科目C", 8000],
      ["科目D", 7000],
      ["科目E", 6000],
      ["その他", 14500],
    ]);
    expect(new Set(slices.map((s) => s.key)).size).toBe(slices.length);
  });
});

describe("yearlyIncomeTotals", () => {
  test("割り当て年度ごとに事業＋不動産の収入・経費・差引を古い順に並べる", () => {
    const totals = yearlyIncomeTotals(sampleTransactions());
    expect(totals.map((t) => t.year)).toEqual([2024, 2025]);
    const [first] = totals;
    expect(first!.balance).toBe(first!.revenue - first!.expenses);
  });
});

describe("smallBusinessSpecialLabel", () => {
  test("特例の率から名前を作る", () => {
    expect(smallBusinessSpecialLabel(0.2)).toBe("2割特例");
    expect(smallBusinessSpecialLabel(0.3)).toBe("3割特例");
  });
});
