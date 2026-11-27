import { describe, expect, test } from "bun:test";
import {
  EMPTY_AGRICULTURE_INPUT,
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_MISC_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
  Transaction,
  buildTrialBalance,
  buildXtxFiling,
  computeCorrectedFigures,
  computeIncomeTax,
  statementCategoryTotals,
} from "../src";

function tx(partial: Partial<Transaction>): Transaction {
  return {
    date: "2023-06-15",
    year: 2023,
    description: "テスト",
    amount: 0,
    account: "普通預金",
    category: "未分類",
    income_type: "business",
    tax_category: "",
    ...partial,
  };
}

const TRANSACTIONS: Transaction[] = [
  tx({ date: "2023-01-15", description: "事業売上1", amount: 5_000_000, category: "売上高" }),
  tx({ date: "2023-06-15", description: "事業売上2", amount: 7_000_000, category: "売上高" }),
  tx({ description: "仕入", amount: -2_000_000, category: "仕入高" }),
  tx({ description: "通信費", amount: -1_200_000, category: "通信費" }),
  tx({ description: "消耗品費", amount: -900_000, category: "消耗品費" }),
  tx({ description: "外注工賃", amount: -500_000, category: "外注工賃" }),
  // 決算書の追加科目（上限6件を超えた分は雑費へ合算される）
  tx({ description: "会議費", amount: -10_000, category: "会議費" }),
  tx({ description: "新聞図書費", amount: -20_000, category: "新聞図書費" }),
  tx({ description: "支払手数料", amount: -30_000, category: "支払手数料" }),
  tx({ description: "研修費", amount: -40_000, category: "研修費" }),
  tx({ description: "車両費", amount: -50_000, category: "車両費" }),
  tx({ description: "印刷費", amount: -60_000, category: "印刷費" }),
  tx({ description: "配送費", amount: -70_000, category: "配送費" }),
  tx({ description: "雑費", amount: -10_000, category: "雑費" }),
  // 不動産
  tx({ description: "家賃収入", amount: 1_764_000, category: "家賃収入", income_type: "real_estate" }),
  tx({ description: "固定資産税", amount: -300_000, category: "租税公課", income_type: "real_estate" }),
  tx({ description: "管理費", amount: -170_000, category: "管理費", income_type: "real_estate" }),
  tx({ description: "修繕費", amount: -50_000, category: "修繕費", income_type: "real_estate" }),
  // その他区分（決算書には載らない）
  tx({ date: "2023-03-01", description: "チャージ", amount: 100_000, category: "その他", income_type: "other" }),
  tx({ date: "2023-03-02", description: "カード決済", amount: -30_000, category: "その他", income_type: "other" }),
];

/** XTX内の金額タグを取り出す（無い場合はテストを落とす）。 */
function tagValue(xtx: string, tag: string): number {
  const match = new RegExp(`<${tag}>(-?\\d+)</${tag}>`).exec(xtx);
  if (!match) throw new Error(`XTXにタグ ${tag} がありません`);
  return Number(match[1]);
}

function buildSampleXtx(balanceSheet?: Parameters<typeof buildXtxFiling>[0]["balanceSheet"]): string {
  const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
  const tax = computeIncomeTax({
    year: 2023,
    totalIncome: figures._detail.business_income + figures._detail.real_estate_income,
    deductions: { ...EMPTY_DEDUCTION_INPUTS },
    taxCredits: { ...EMPTY_TAX_CREDIT_INPUTS },
  });
  return buildXtxFiling({
    year: 2023,
    amendment: false,
    submissionDate: "2024-03-10",
    taxpayer: {
      name: "テスト太郎",
      nameKana: "テストタロウ",
      zipCode: "7220062",
      address: "広島県尾道市向東町3567-1",
      addressLine2: "",
      birthDate: "1980-04-01",
      phone: "080-2500-7879",
      taxOfficeName: "尾道",
      taxOfficeCode: "08121",
      myNumber: "",
      userId: "1234567890123456",
      occupation: "システムエンジニア",
      shopName: "",
      jan1Address: "",
    },
    figures,
    miscIncome: EMPTY_MISC_INCOME,
    deductionInputs: { ...EMPTY_DEDUCTION_INPUTS },
    tax,
    categoryTotals: {
      business: statementCategoryTotals(TRANSACTIONS, "business"),
      realEstate: statementCategoryTotals(TRANSACTIONS, "real_estate"),
    },
    withholdingTax: 0,
    prepaidTax: 0,
    originalThirdPeriodTax: null,
    balanceSheet,
  });
}

describe("buildTrialBalance の損益計算書（XTX決算書との一致）", () => {
  const tb = buildTrialBalance(TRANSACTIONS, 2023);
  const xtx = buildSampleXtx();

  test("事業：売上・仕入・経費計・差引・青色控除・所得が KOA210 と一致する", () => {
    expect(tb.business.revenue).toBe(tagValue(xtx, "AMF00100"));
    expect(tb.business.purchases).toBe(tagValue(xtx, "AMF00160"));
    expect(tb.business.revenue - tb.business.purchases).toBe(tagValue(xtx, "AMF00170"));
    expect(tb.business.expenses).toBe(tagValue(xtx, "AMF00380"));
    expect(tb.business.income_before_blue).toBe(tagValue(xtx, "AMF00390"));
    // 青色控除は不動産→事業の順に配分されるため、このデータでは事業分は0で
    // KOA210 側の行自体が出ない
    expect(tb.business.blue_deduction).toBe(0);
    expect(xtx).not.toContain("<AMF00510>");
    expect(tb.business.income).toBe(tagValue(xtx, "AMF00530"));
  });

  test("事業：経費の固定行が KOA210 のタグと一致する", () => {
    const line = (name: string) => tb.business.expense_lines.find((l) => l.category === name);
    expect(line("通信費")?.amount).toBe(tagValue(xtx, "AMF00230"));
    expect(line("消耗品費")?.amount).toBe(tagValue(xtx, "AMF00280"));
    // 外注工賃は外注費へ合算される
    expect(line("外注費")?.amount).toBe(tagValue(xtx, "AMF00320"));
    expect(line("外注費")?.amount).toBe(500_000);
    expect(line("外注費")?.categories).toEqual(["外注費", "外注工賃"]);
    expect(line("外注工賃")).toBeUndefined();
  });

  test("事業：追加科目は6件までで、超過分は雑費に合算される（KOA210 と同規則）", () => {
    const names = tb.business.expense_lines.map((l) => l.category);
    expect(names).toContain("会議費");
    expect(names).toContain("印刷費");
    expect(names).not.toContain("配送費");
    const misc = tb.business.expense_lines.find((l) => l.category === "雑費");
    // 雑費 10,000 + 配送費 70,000（上限超過分）
    expect(misc?.amount).toBe(80_000);
    expect(misc?.amount).toBe(tagValue(xtx, "AMF00370"));
    expect(misc?.categories).toEqual(["雑費", "配送費"]);
    // 雑費は常に追加科目の後（最後）に置かれる
    expect(names[names.length - 1]).toBe("雑費");
  });

  test("不動産：家賃・経費計・差引・青色控除・所得が KOA220 と一致する", () => {
    expect(tb.real_estate.revenue_lines[0]?.category).toBe("家賃収入");
    expect(tb.real_estate.revenue_lines[0]?.amount).toBe(tagValue(xtx, "ANF00080"));
    expect(tb.real_estate.revenue).toBe(tagValue(xtx, "ANF00110"));
    expect(tb.real_estate.expenses).toBe(tagValue(xtx, "ANF00220"));
    expect(tb.real_estate.income_before_blue).toBe(tagValue(xtx, "ANF00230"));
    expect(tb.real_estate.blue_deduction).toBe(tagValue(xtx, "ANF00260"));
    expect(tb.real_estate.income).toBe(tagValue(xtx, "ANF00270"));
    const line = (name: string) => tb.real_estate.expense_lines.find((l) => l.category === name);
    expect(line("租税公課")?.amount).toBe(tagValue(xtx, "ANF00130"));
    expect(line("修繕費")?.amount).toBe(tagValue(xtx, "ANF00150"));
    // 管理費は固定行に無いため追加科目として出る
    expect(line("管理費")?.amount).toBe(170_000);
  });

  test("その他区分は決算書に載らず、参考集計として分かれている", () => {
    expect(tb.other.revenue).toBe(100_000);
    expect(tb.other.expenses).toBe(30_000);
  });

  test("収入の内訳の合計は区分の収入と一致する", () => {
    const sum = (lines: { amount: number }[]) => lines.reduce((a, l) => a + l.amount, 0);
    expect(sum(tb.business.revenue_lines)).toBe(tb.business.revenue);
    expect(sum(tb.real_estate.revenue_lines)).toBe(tb.real_estate.revenue);
  });
});

describe("buildTrialBalance: 農業所得がある場合の青色申告特別控除", () => {
  test("農業所得を含めて配分し、XTX と同じ不動産分になる", () => {
    const rentOnly: Transaction[] = [
      tx({ description: "家賃", amount: 1_200_000, category: "家賃収入", income_type: "real_estate" }),
    ];
    const agriculture = { ...EMPTY_AGRICULTURE_INPUT, salesAmount: 2_000_000, expenseTotals: { 肥料費: 500_000 } };
    const tb = buildTrialBalance(rentOnly, 2023, { agriculture });
    const figures = computeCorrectedFigures(rentOnly, 2023, { agriculture });
    expect(tb.real_estate.blue_deduction).toBe(figures._detail.blue_deduction_real_estate);
    expect(tb.real_estate.blue_deduction).toBe(650_000);
  });
});

describe("buildTrialBalance: 経費の返金・売上の返品", () => {
  const withRefunds: Transaction[] = [
    tx({ description: "売上", amount: 1_100_000, category: "売上高" }),
    tx({ description: "売上の返品", amount: -110_000, category: "売上高" }),
    tx({ description: "回線", amount: -110_000, category: "通信費" }),
    tx({ description: "回線 返金", amount: 55_000, category: "通信費" }),
  ];
  const tb = buildTrialBalance(withRefunds, 2023);
  const sum = (lines: { amount: number }[]) => lines.reduce((a, l) => a + l.amount, 0);

  test("経費の返金は経費の減額、売上の返品は売上の減額として集計する", () => {
    expect(tb.business.revenue).toBe(990_000);
    expect(tb.business.expenses).toBe(55_000);
    expect(tb.business.revenue_lines.map((l) => l.category)).toEqual(["売上高"]);
  });

  test("経費行の合計は経費計と一致する", () => {
    expect(sum(tb.business.expense_lines)).toBe(tb.business.expenses);
    expect(sum(tb.business.revenue_lines)).toBe(tb.business.revenue);
  });
});

describe("buildTrialBalance の月次推移", () => {
  const tb = buildTrialBalance(TRANSACTIONS, 2023);

  test("12か月分が並び、月ごとの収支と累計が正しい", () => {
    expect(tb.monthly).toHaveLength(12);
    expect(tb.monthly[0]).toEqual({
      month: 1,
      revenue: 5_000_000,
      expenses: 0,
      balance: 5_000_000,
      cumulative: 5_000_000,
    });
    // 6月: 売上 7,000,000、支出は 2023-06-15 の既定日付の取引群
    const june = tb.monthly[5];
    expect(june?.revenue).toBe(7_000_000 + 1_764_000);
    const juneExpenses =
      2_000_000 + 1_200_000 + 900_000 + 500_000 + 10_000 + 20_000 + 30_000 + 40_000 + 50_000 + 60_000 + 70_000 + 10_000 + 300_000 + 170_000 + 50_000;
    expect(june?.expenses).toBe(juneExpenses);
    expect(june?.balance).toBe((june?.revenue ?? 0) - juneExpenses);
  });

  test("月次の合計は事業＋不動産の年間収支と一致し、その他区分は含まない", () => {
    const revenue = tb.monthly.reduce((a, m) => a + m.revenue, 0);
    const expenses = tb.monthly.reduce((a, m) => a + m.expenses, 0);
    expect(revenue).toBe(tb.business.revenue + tb.real_estate.revenue);
    expect(expenses).toBe(
      tb.business.revenue - tb.business.purchases + tb.business.purchases - tb.business.income_before_blue + tb.real_estate.expenses,
    );
    const last = tb.monthly[11];
    expect(last?.cumulative).toBe(revenue - expenses);
  });

  test("対象年以外の取引は含まれない", () => {
    const withOtherYear = [
      ...TRANSACTIONS,
      tx({ date: "2022-05-01", year: 2022, amount: 999_999, category: "売上高" }),
    ];
    const tb2023 = buildTrialBalance(withOtherYear, 2023);
    expect(tb2023.business.revenue).toBe(tb.business.revenue);
    const tb2022 = buildTrialBalance(withOtherYear, 2022);
    expect(tb2022.business.revenue).toBe(999_999);
    expect(tb2022.monthly[4]?.revenue).toBe(999_999);
  });
});

describe("buildTrialBalance の貸借対照表", () => {
  const figures = computeCorrectedFigures(TRANSACTIONS, 2023);
  const incomeBeforeBlue = figures._detail.business_income_before_deduction;
  const balancedInput = {
    opening: { capital: 1_000_000, cash: 1_000_000 },
    closing: { cash: 1_000_000 + incomeBeforeBlue },
    ownerLoan: 0,
    ownerBorrowing: 0,
  };

  test("貸借一致する入力では合計が KOA210-4 と一致し balanced になる", () => {
    const tb = buildTrialBalance(TRANSACTIONS, 2023, { balanceSheet: balancedInput });
    const bs = tb.balance_sheet;
    expect(bs).not.toBeNull();
    expect(bs?.opening_balanced).toBe(true);
    expect(bs?.closing_balanced).toBe(true);
    expect(bs?.capital).toBe(1_000_000);
    expect(bs?.income_before_blue).toBe(incomeBeforeBlue);

    const xtx = buildSampleXtx(balancedInput);
    expect(bs?.opening_assets).toBe(tagValue(xtx, "AMG00230"));
    expect(bs?.closing_assets).toBe(tagValue(xtx, "AMG00440"));
    expect(bs?.opening_liabilities_capital).toBe(tagValue(xtx, "AMG00610"));
    expect(bs?.closing_liabilities_capital).toBe(tagValue(xtx, "AMG00760"));
  });

  test("貸借一致しない入力では例外にせずフラグで返る（XTX側は例外）", () => {
    const tb = buildTrialBalance(TRANSACTIONS, 2023, {
      balanceSheet: { ...balancedInput, closing: { cash: 1 } },
    });
    expect(tb.balance_sheet?.closing_balanced).toBe(false);
    expect(tb.balance_sheet?.opening_balanced).toBe(true);
    expect(() => buildSampleXtx({ ...balancedInput, closing: { cash: 1 } })).toThrow();
  });

  test("入力が無ければ balance_sheet は null", () => {
    expect(buildTrialBalance(TRANSACTIONS, 2023).balance_sheet).toBeNull();
  });
});
