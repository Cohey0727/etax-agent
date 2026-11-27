/**
 * agriculture.ts — 農業所得（Issue #24 Phase 1）の入力モデルと決定的計算。
 *
 * 農業所得は申告入力として保持する（帳簿の取引とは混ぜない）。金額計算は
 * 青色申告決算書（農業所得用）KOA240 と収支内訳書（農業所得用）KOA120 の
 * 様式の計算チェーンに一致させる:
 *
 *   収入金額の計 = 販売金額 + 家事消費・事業消費金額 + 雑収入
 *                  + 農産物の棚卸高（期首） − 農産物の棚卸高（期末）
 *   経費計       = 経費科目の合計 + 農産物以外の棚卸高（期首）
 *                  − 農産物以外の棚卸高（期末） − 育成費用（経費から差し引く分）
 *   差引金額     = 収入金額の計 − 経費計
 *   青色: 特別控除前の所得金額 = 差引金額 + 引当金繰戻額等 − 引当金繰入額等
 *         （繰入額等には専従者給与と貸倒引当金繰入額が入る）
 *   白色: 所得金額 = 差引金額 − 専従者控除
 *
 * 科目の並びと固定行は国税庁の現行様式（令和7年分）および同梱XSD
 * （KOA240 VR8.0 / KOA120 VR9.0）の appinfo 項目名で確認した。
 * 肉用牛の売却による農業所得の課税特例の金額は様式の表示行のみで、
 * 所得金額の計算には影響させない。
 */

import { toInteger as num } from "./inputValues";

/** 農業所得の入力（内部形式・camelCase）。金額は円単位の整数。 */
export interface AgricultureInput {
  /** 農園名（様式の「農園名」欄。空文字なら出力しない） */
  farmName: string;
  /** 販売金額 */
  salesAmount: number;
  /** 家事消費・事業消費金額 */
  householdConsumption: number;
  /** 雑収入 */
  miscRevenue: number;
  /** 農産物の棚卸高（期首） */
  produceOpeningInventory: number;
  /** 農産物の棚卸高（期末） */
  produceClosingInventory: number;
  /** 農産物以外の棚卸高（期首） */
  otherOpeningInventory: number;
  /** 農産物以外の棚卸高（期末） */
  otherClosingInventory: number;
  /** 経費の科目別合計（科目名 → 金額）。支出は正の金額で持つ。 */
  expenseTotals: Record<string, number>;
  /** 専従者給与（青色のみ。繰入額等に入る） */
  familyWorkerSalary: number;
  /** 専従者控除（白色のみ） */
  familyWorkerDeduction: number;
  /** 貸倒引当金繰入額（青色のみ） */
  badDebtProvisionIn: number;
  /** 貸倒引当金繰戻額（青色のみ） */
  badDebtProvisionBack: number;
  /** 経費から差し引く果樹牛馬等の育成費用 */
  cultivationCostDeduction: number;
  /** 肉用牛について特例の適用を受ける金額（表示のみ・計算に影響しない） */
  beefCattleExemptionAmount: number;
}

export const EMPTY_AGRICULTURE_INPUT: AgricultureInput = {
  farmName: "",
  salesAmount: 0,
  householdConsumption: 0,
  miscRevenue: 0,
  produceOpeningInventory: 0,
  produceClosingInventory: 0,
  otherOpeningInventory: 0,
  otherClosingInventory: 0,
  expenseTotals: {},
  familyWorkerSalary: 0,
  familyWorkerDeduction: 0,
  badDebtProvisionIn: 0,
  badDebtProvisionBack: 0,
  cultivationCostDeduction: 0,
  beefCattleExemptionAmount: 0,
};

/**
 * 青色申告決算書（農業所得用）の固定経費科目（様式の並び順）。
 * 「雑費」は追加科目の後に置かれるため固定行には含めない。
 */
export const AGRICULTURE_BLUE_EXPENSE_CATEGORIES: readonly string[] = [
  "租税公課",
  "種苗費",
  "素畜費",
  "肥料費",
  "飼料費",
  "農具費",
  "農薬衛生費",
  "諸材料費",
  "修繕費",
  "動力光熱費",
  "作業用衣料費",
  "農業共済掛金",
  "減価償却費",
  "荷造運賃手数料",
  "雇人費",
  "利子割引料",
  "地代賃借料",
  "土地改良費",
];

/**
 * 収支内訳書（農業所得用）で経費の先頭に独立行として置かれる科目。
 * 「地代賃借料」は白色様式では「小作料・賃借料」の行に出力する。
 */
export const AGRICULTURE_WHITE_TOP_EXPENSE_CATEGORIES: readonly string[] = [
  "雇人費",
  "地代賃借料",
  "減価償却費",
  "貸倒金",
  "利子割引料",
];

/** 収支内訳書（農業所得用）の「その他の経費」の固定科目（様式の並び順）。 */
export const AGRICULTURE_WHITE_OTHER_EXPENSE_CATEGORIES: readonly string[] = [
  "租税公課",
  "種苗費",
  "素畜費",
  "肥料費",
  "飼料費",
  "農具費",
  "農薬衛生費",
  "諸材料費",
  "修繕費",
  "動力光熱費",
  "作業用衣料費",
  "農業共済掛金",
  "荷造運賃手数料",
  "土地改良費",
];

/** 入力UIで提示する農業の経費科目（固定科目＋白色専用の貸倒金＋雑費）。 */
export const AGRICULTURE_EXPENSE_CATEGORIES: readonly string[] = [
  ...AGRICULTURE_BLUE_EXPENSE_CATEGORIES,
  "貸倒金",
  "雑費",
];

/** 様式の追加科目の上限（青色・白色とも4行）。 */
const MAX_EXTRA_EXPENSE_ROWS = 4;

/** 科目別合計を正規化する（名前の空白除去、0円と空名は捨てる）。 */
function normalizeExpenseTotals(raw: unknown): Record<string, number> {
  if (typeof raw !== "object" || raw === null) return {};
  const totals: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = name.trim();
    const amount = num(value);
    if (key === "" || amount === 0) continue;
    totals[key] = (totals[key] ?? 0) + amount;
  }
  return totals;
}

/** 農業所得の入力を正規化する（欠けた項目は0、金額は整数化）。 */
export function normalizeAgricultureInput(
  input: Partial<AgricultureInput> | null | undefined,
): AgricultureInput {
  const src = input ?? {};
  return {
    farmName: typeof src.farmName === "string" ? src.farmName : "",
    salesAmount: num(src.salesAmount),
    householdConsumption: num(src.householdConsumption),
    miscRevenue: num(src.miscRevenue),
    produceOpeningInventory: num(src.produceOpeningInventory),
    produceClosingInventory: num(src.produceClosingInventory),
    otherOpeningInventory: num(src.otherOpeningInventory),
    otherClosingInventory: num(src.otherClosingInventory),
    expenseTotals: normalizeExpenseTotals(src.expenseTotals),
    familyWorkerSalary: num(src.familyWorkerSalary),
    familyWorkerDeduction: num(src.familyWorkerDeduction),
    badDebtProvisionIn: num(src.badDebtProvisionIn),
    badDebtProvisionBack: num(src.badDebtProvisionBack),
    cultivationCostDeduction: num(src.cultivationCostDeduction),
    beefCattleExemptionAmount: num(src.beefCattleExemptionAmount),
  };
}

/** 農業所得の入力が全て空（様式を添付しない状態）かどうか。 */
export function isAgricultureEmpty(input: AgricultureInput): boolean {
  const n = normalizeAgricultureInput(input);
  return (
    n.farmName === "" &&
    n.salesAmount === 0 &&
    n.householdConsumption === 0 &&
    n.miscRevenue === 0 &&
    n.produceOpeningInventory === 0 &&
    n.produceClosingInventory === 0 &&
    n.otherOpeningInventory === 0 &&
    n.otherClosingInventory === 0 &&
    Object.keys(n.expenseTotals).length === 0 &&
    n.familyWorkerSalary === 0 &&
    n.familyWorkerDeduction === 0 &&
    n.badDebtProvisionIn === 0 &&
    n.badDebtProvisionBack === 0 &&
    n.cultivationCostDeduction === 0 &&
    n.beefCattleExemptionAmount === 0
  );
}

/** 科目別の金額行（様式の固定行・追加科目行の出力用）。 */
export interface AgricultureExpenseRow {
  category: string;
  amount: number;
}

/** 農業所得の決算書計算結果（様式の各行に対応する決定的な内訳）。 */
export interface AgricultureStatement {
  farmName: string;
  salesAmount: number;
  householdConsumption: number;
  miscRevenue: number;
  /** 収入金額の小計（販売金額＋家事消費・事業消費金額＋雑収入） */
  revenueSubtotal: number;
  produceOpeningInventory: number;
  produceClosingInventory: number;
  /** 収入金額の計（小計＋農産物期首棚卸−農産物期末棚卸） */
  revenueTotal: number;
  /** 正規化済みの科目別合計 */
  expenseTotals: Record<string, number>;
  /** 青色: 固定経費行（様式の並び順、0円は含まない） */
  blueExpenseRows: AgricultureExpenseRow[];
  /** 青色: 追加科目行（上限4行） */
  blueExtraExpenses: AgricultureExpenseRow[];
  /** 青色: 雑費（固定行の雑費＋追加科目の上限超過分の合算） */
  blueMiscExpense: number;
  /** 経費の小計（全科目の合計。青色様式の「小計」行） */
  expensesSubtotal: number;
  /** 白色: 経費の先頭の独立行（雇人費・地代賃借料・減価償却費・貸倒金・利子割引料） */
  whiteTopExpenseRows: AgricultureExpenseRow[];
  /** 白色: 「その他の経費」の固定行 */
  whiteOtherExpenseRows: AgricultureExpenseRow[];
  /** 白色: 「その他の経費」の追加科目行（上限4行） */
  whiteExtraExpenses: AgricultureExpenseRow[];
  /** 白色: 雑費（固定行の雑費＋追加科目の上限超過分の合算） */
  whiteMiscExpense: number;
  /** 白色: 「その他の経費」の小計（棚卸・育成費用の調整込み） */
  whiteOtherExpensesSubtotal: number;
  otherOpeningInventory: number;
  otherClosingInventory: number;
  cultivationCostDeduction: number;
  /** 経費計（小計＋農産物以外期首棚卸−農産物以外期末棚卸−育成費用） */
  expensesTotal: number;
  /** 差引金額（収入金額の計−経費計） */
  balanceAmount: number;
  /** 貸倒引当金繰戻額 */
  badDebtProvisionBack: number;
  /** 各種引当金等の繰戻額等の計（青色） */
  provisionBackTotal: number;
  /** 専従者給与（青色） */
  familyWorkerSalary: number;
  /** 貸倒引当金繰入額（青色） */
  badDebtProvisionIn: number;
  /** 各種引当金等の繰入額等の計（青色。専従者給与＋貸倒引当金繰入額） */
  provisionInTotal: number;
  /** 専従者控除（白色） */
  familyWorkerDeduction: number;
  /** 肉用牛について特例の適用を受ける金額（表示のみ） */
  beefCattleExemptionAmount: number;
}

/** 固定科目の行を取り出す（並び順どおり、0円は除く）。 */
function fixedRows(
  totals: Record<string, number>,
  categories: readonly string[],
): AgricultureExpenseRow[] {
  const rows: AgricultureExpenseRow[] = [];
  for (const category of categories) {
    const amount = totals[category] ?? 0;
    if (amount !== 0) rows.push({ category, amount });
  }
  return rows;
}

/**
 * 固定科目に無い科目を追加科目と雑費へ振り分ける。追加科目は金額の
 * 大きい順（同額は科目名順）で上限まで、超過分は雑費へ合算する
 * （一般用の決算書と同じ決定的規則）。
 */
function splitExtras(
  totals: Record<string, number>,
  fixedCategories: ReadonlySet<string>,
): { extras: AgricultureExpenseRow[]; miscExpense: number } {
  const extraEntries = Object.entries(totals)
    .filter(([name]) => name !== "雑費" && !fixedCategories.has(name))
    .map(([name, amount]) => ({ category: name, amount }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category, "ja"));
  const extras = extraEntries.slice(0, MAX_EXTRA_EXPENSE_ROWS);
  const overflow = extraEntries
    .slice(MAX_EXTRA_EXPENSE_ROWS)
    .reduce((sum, row) => sum + row.amount, 0);
  return { extras, miscExpense: (totals["雑費"] ?? 0) + overflow };
}

/** 農業所得の入力から決算書（青色・白色共通）の計算内訳を作る。 */
export function computeAgricultureStatement(
  input: AgricultureInput,
): AgricultureStatement {
  const n = normalizeAgricultureInput(input);
  const totals = n.expenseTotals;

  const revenueSubtotal = n.salesAmount + n.householdConsumption + n.miscRevenue;
  const revenueTotal =
    revenueSubtotal + n.produceOpeningInventory - n.produceClosingInventory;

  const blueFixed = new Set<string>(AGRICULTURE_BLUE_EXPENSE_CATEGORIES);
  const blue = splitExtras(totals, blueFixed);
  const whiteFixed = new Set<string>([
    ...AGRICULTURE_WHITE_TOP_EXPENSE_CATEGORIES,
    ...AGRICULTURE_WHITE_OTHER_EXPENSE_CATEGORIES,
  ]);
  const white = splitExtras(totals, whiteFixed);

  const expensesSubtotal = Object.values(totals).reduce((sum, v) => sum + v, 0);
  const whiteOtherExpensesSubtotal =
    fixedRows(totals, AGRICULTURE_WHITE_OTHER_EXPENSE_CATEGORIES).reduce(
      (sum, row) => sum + row.amount,
      0,
    ) +
    white.extras.reduce((sum, row) => sum + row.amount, 0) +
    white.miscExpense +
    n.otherOpeningInventory -
    n.otherClosingInventory -
    n.cultivationCostDeduction;
  const expensesTotal =
    expensesSubtotal +
    n.otherOpeningInventory -
    n.otherClosingInventory -
    n.cultivationCostDeduction;

  return {
    farmName: n.farmName,
    salesAmount: n.salesAmount,
    householdConsumption: n.householdConsumption,
    miscRevenue: n.miscRevenue,
    revenueSubtotal,
    produceOpeningInventory: n.produceOpeningInventory,
    produceClosingInventory: n.produceClosingInventory,
    revenueTotal,
    expenseTotals: totals,
    blueExpenseRows: fixedRows(totals, AGRICULTURE_BLUE_EXPENSE_CATEGORIES),
    blueExtraExpenses: blue.extras,
    blueMiscExpense: blue.miscExpense,
    expensesSubtotal,
    whiteTopExpenseRows: fixedRows(totals, AGRICULTURE_WHITE_TOP_EXPENSE_CATEGORIES),
    whiteOtherExpenseRows: fixedRows(
      totals,
      AGRICULTURE_WHITE_OTHER_EXPENSE_CATEGORIES,
    ),
    whiteExtraExpenses: white.extras,
    whiteMiscExpense: white.miscExpense,
    whiteOtherExpensesSubtotal,
    otherOpeningInventory: n.otherOpeningInventory,
    otherClosingInventory: n.otherClosingInventory,
    cultivationCostDeduction: n.cultivationCostDeduction,
    expensesTotal,
    balanceAmount: revenueTotal - expensesTotal,
    badDebtProvisionBack: n.badDebtProvisionBack,
    provisionBackTotal: n.badDebtProvisionBack,
    familyWorkerSalary: n.familyWorkerSalary,
    badDebtProvisionIn: n.badDebtProvisionIn,
    provisionInTotal: n.familyWorkerSalary + n.badDebtProvisionIn,
    familyWorkerDeduction: n.familyWorkerDeduction,
    beefCattleExemptionAmount: n.beefCattleExemptionAmount,
  };
}

/**
 * 青色申告特別控除の対象になる所得金額。青色の場合は特別控除前の
 * 所得金額（差引金額＋繰戻額等−繰入額等）、白色の場合は専従者控除後の
 * 所得金額（白色に特別控除は無いため、そのまま最終の農業所得になる）。
 */
export function agricultureIncomeBeforeBlueDeduction(
  statement: AgricultureStatement,
  white: boolean,
): number {
  return white
    ? statement.balanceAmount - statement.familyWorkerDeduction
    : statement.balanceAmount +
        statement.provisionBackTotal -
        statement.provisionInTotal;
}

// ---------------------------------------------------------------------------
// ワイヤ形式（snake_case）との変換。API の export 系リクエストで使う。
// ---------------------------------------------------------------------------

export interface AgricultureWire {
  farm_name: string;
  sales_amount: number;
  household_consumption: number;
  misc_revenue: number;
  produce_opening_inventory: number;
  produce_closing_inventory: number;
  other_opening_inventory: number;
  other_closing_inventory: number;
  expense_totals: Record<string, number>;
  family_worker_salary: number;
  family_worker_deduction: number;
  bad_debt_provision_in: number;
  bad_debt_provision_back: number;
  cultivation_cost_deduction: number;
  beef_cattle_exemption_amount: number;
}

/** ドメイン形式の農業所得入力をワイヤ形式（snake_case）へ変換する。 */
export function agricultureToWire(input: AgricultureInput): AgricultureWire {
  const n = normalizeAgricultureInput(input);
  return {
    farm_name: n.farmName,
    sales_amount: n.salesAmount,
    household_consumption: n.householdConsumption,
    misc_revenue: n.miscRevenue,
    produce_opening_inventory: n.produceOpeningInventory,
    produce_closing_inventory: n.produceClosingInventory,
    other_opening_inventory: n.otherOpeningInventory,
    other_closing_inventory: n.otherClosingInventory,
    expense_totals: { ...n.expenseTotals },
    family_worker_salary: n.familyWorkerSalary,
    family_worker_deduction: n.familyWorkerDeduction,
    bad_debt_provision_in: n.badDebtProvisionIn,
    bad_debt_provision_back: n.badDebtProvisionBack,
    cultivation_cost_deduction: n.cultivationCostDeduction,
    beef_cattle_exemption_amount: n.beefCattleExemptionAmount,
  };
}

/** ワイヤ形式（snake_case）の農業所得入力をドメイン形式へ変換する。 */
export function agricultureFromWire(wire: AgricultureWire): AgricultureInput {
  return normalizeAgricultureInput({
    farmName: wire.farm_name,
    salesAmount: wire.sales_amount,
    householdConsumption: wire.household_consumption,
    miscRevenue: wire.misc_revenue,
    produceOpeningInventory: wire.produce_opening_inventory,
    produceClosingInventory: wire.produce_closing_inventory,
    otherOpeningInventory: wire.other_opening_inventory,
    otherClosingInventory: wire.other_closing_inventory,
    expenseTotals: wire.expense_totals,
    familyWorkerSalary: wire.family_worker_salary,
    familyWorkerDeduction: wire.family_worker_deduction,
    badDebtProvisionIn: wire.bad_debt_provision_in,
    badDebtProvisionBack: wire.bad_debt_provision_back,
    cultivationCostDeduction: wire.cultivation_cost_deduction,
    beefCattleExemptionAmount: wire.beef_cattle_exemption_amount,
  });
}
