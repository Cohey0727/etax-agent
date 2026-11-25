/**
 * trialBalance.ts — 残高試算表レポートの集計（Issue #18）。
 *
 * 損益計算書の部は、XTXの青色申告決算書（KOA210/KOA220）と数値が一致する
 * よう、既存の決定的な計算（computeCorrectedFigures）と決算書の科目
 * 振り分け（statementCategoryTotals）をそのまま使い、固定行の並び・
 * 追加科目の上限と雑費への合算まで buildKoa210/buildKoa220 と同じ規則で
 * 行を組み立てる（二重実装にしない）。
 *
 * 貸借対照表の部は取引からは算出できないため、XTXと同じ貸借対照表入力
 * （期首・期末）を受け取り、buildBalanceSheetPage と同じ算出で合計と
 * 貸借一致を返す（XTX側は不一致で例外にするが、レポート側は不一致を
 * 表示するために例外にせずフラグで返す）。
 */

import { filterYear, statementCategoryTotals } from "./ledger";
import {
  aggregateIncome,
  computeCorrectedFigures,
  transactionBusinessAmount,
  type CorrectedFigures,
  type FilingType,
} from "./taxcalc";
import type { IncomeType, Transaction } from "./types";
import {
  BS_ASSET_ACCOUNTS,
  BS_LIABILITY_ACCOUNTS,
  KOA210_EXPENSE_LINES,
  KOA220_EXPENSE_LINES,
  type BalanceSheetAccount,
  type XtxBalanceSheetInput,
} from "./xtx";

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export interface TrialBalanceLine {
  /** 表示名（決算書の行名） */
  category: string;
  /** ドリルダウン用：この行に含まれる実際の勘定科目名 */
  categories: string[];
  amount: number;
}

export interface TrialBalancePl {
  revenue_lines: TrialBalanceLine[];
  /** 売上（収入）金額 */
  revenue: number;
  /** 仕入高（事業のみ。それ以外は 0） */
  purchases: number;
  expense_lines: TrialBalanceLine[];
  /** 経費計（事業は仕入高を除いた決算書の経費計と一致する） */
  expenses: number;
  /** 差引金額（青色申告特別控除前） */
  income_before_blue: number;
  /** 青色申告特別控除（この区分への配分額） */
  blue_deduction: number;
  /** 所得金額（青色申告特別控除後） */
  income: number;
}

export interface TrialBalanceOther {
  revenue_lines: TrialBalanceLine[];
  revenue: number;
  expense_lines: TrialBalanceLine[];
  expenses: number;
}

export interface TrialBalanceMonth {
  month: number;
  revenue: number;
  expenses: number;
  balance: number;
  cumulative: number;
}

export interface TrialBalanceBsRow {
  key: string;
  label: string;
  opening: number;
  closing: number;
}

export interface TrialBalanceBs {
  asset_rows: TrialBalanceBsRow[];
  liability_rows: TrialBalanceBsRow[];
  /** 事業主貸（期末・資産の部） */
  owner_loan: number;
  /** 事業主借（期末・負債の部の内訳行） */
  owner_borrowing: number;
  /** 元入金（期首） */
  capital: number;
  /** 期末の負債・資本に加わる所得金額（事業・青色申告特別控除前） */
  income_before_blue: number;
  opening_assets: number;
  opening_liabilities_capital: number;
  closing_assets: number;
  closing_liabilities_capital: number;
  opening_balanced: boolean;
  closing_balanced: boolean;
}

export interface TrialBalance {
  year: number;
  business: TrialBalancePl;
  real_estate: TrialBalancePl;
  /** その他区分（資金移動など。決算書には載らない参考集計） */
  other: TrialBalanceOther;
  /** 月次推移（事業＋不動産。日付の月で割り当てる） */
  monthly: TrialBalanceMonth[];
  /** 貸借対照表入力がある場合のみ */
  balance_sheet: TrialBalanceBs | null;
}

export interface TrialBalanceOptions {
  filingType?: FilingType;
  realEstateBusinessScale?: boolean;
  balanceSheet?: XtxBalanceSheetInput;
}

// ---------------------------------------------------------------------------
// 損益計算書の行の組み立て（決算書と同じ規則）
// ---------------------------------------------------------------------------

/** 収入の内訳（事業分の科目別合計、金額の大きい順）。合計は区分の収入と一致する。 */
function revenueLines(transactions: Transaction[], incomeType: IncomeType): TrialBalanceLine[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.income_type !== incomeType) continue;
    const amount = transactionBusinessAmount(t);
    if (amount <= 0) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, categories: [category], amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** 支出の内訳（事業分の絶対値の科目別合計、金額の大きい順）。 */
function expenseLinesBySign(
  transactions: Transaction[],
  incomeType: IncomeType,
): TrialBalanceLine[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.income_type !== incomeType) continue;
    const amount = transactionBusinessAmount(t);
    if (amount >= 0) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + -amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, categories: [category], amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * 決算書の経費欄と同じ並びで行を組み立てる：固定行（様式の順）→
 * 追加科目（上限まで）→ 雑費（上限を超えた追加科目を合算）。
 * totals は statementCategoryTotals の結果（支出は正の金額）。
 */
function statementExpenseLines(
  totals: Record<string, number>,
  fixedLines: readonly string[],
  extraLimit: number,
  excluded: ReadonlySet<string>,
  extraCategories?: Record<string, string[]>,
): TrialBalanceLine[] {
  const fixed = new Set(fixedLines);
  const lines: TrialBalanceLine[] = [];
  for (const name of fixedLines) {
    if (name === "雑費") continue; // 雑費は追加科目の後に置く（決算書と同じ）
    const amount = totals[name] ?? 0;
    if (amount > 0) {
      lines.push({ category: name, categories: extraCategories?.[name] ?? [name], amount });
    }
  }
  const extras = Object.entries(totals).filter(
    ([account, value]) => value > 0 && !fixed.has(account) && !excluded.has(account),
  );
  for (const [account, value] of extras.slice(0, extraLimit)) {
    lines.push({ category: account, categories: [account], amount: value });
  }
  const overflow = extras.slice(extraLimit);
  const miscAmount = (totals["雑費"] ?? 0) + overflow.reduce((sum, [, value]) => sum + value, 0);
  if (miscAmount > 0) {
    lines.push({
      category: "雑費",
      categories: ["雑費", ...overflow.map(([account]) => account)],
      amount: miscAmount,
    });
  }
  return lines;
}

/** 事業所得の損益計算書（KOA210 1面と同じ数値）。 */
function businessPl(yearTx: Transaction[], figures: CorrectedFigures): TrialBalancePl {
  const totals = { ...statementCategoryTotals(yearTx, "business") };
  // 分類カテゴリの「外注工賃」は決算書の固定行「外注費」に合算する
  const outsourcing = totals["外注工賃"] ?? 0;
  if (outsourcing) {
    totals["外注費"] = (totals["外注費"] ?? 0) + outsourcing;
    totals["外注工賃"] = 0;
  }
  const purchases = totals["仕入高"] ?? 0;
  return {
    revenue_lines: revenueLines(yearTx, "business"),
    revenue: figures.business_revenue,
    purchases,
    expense_lines: statementExpenseLines(
      totals,
      KOA210_EXPENSE_LINES.map(([name]) => name),
      6,
      new Set(["仕入高", "売上高"]),
      outsourcing > 0 ? { "外注費": ["外注費", "外注工賃"] } : undefined,
    ),
    // 決算書の経費計は仕入高（売上原価）を除いた金額
    expenses: figures.business_expenses - purchases,
    income_before_blue: figures._detail.business_income_before_deduction,
    blue_deduction: figures._detail.blue_deduction_business,
    income: figures._detail.business_income,
  };
}

/** 不動産所得の損益計算書（KOA220 1面と同じ数値）。 */
function realEstatePl(yearTx: Transaction[], figures: CorrectedFigures): TrialBalancePl {
  const totals = statementCategoryTotals(yearTx, "real_estate");
  const rent = totals["家賃収入"] ?? 0;
  const lines: TrialBalanceLine[] = [];
  if (rent > 0) lines.push({ category: "家賃収入", categories: ["家賃収入"], amount: rent });
  // 決算書の「その他の収入」= 収入金額計 − 家賃収入
  const otherRevenue = Math.max(figures.real_estate_revenue - rent, 0);
  if (otherRevenue > 0) {
    lines.push({
      category: "その他の収入",
      categories: revenueLines(yearTx, "real_estate")
        .filter((line) => line.category !== "家賃収入")
        .map((line) => line.category),
      amount: otherRevenue,
    });
  }
  return {
    revenue_lines: lines,
    revenue: figures.real_estate_revenue,
    purchases: 0,
    expense_lines: statementExpenseLines(
      totals,
      KOA220_EXPENSE_LINES.map(([name]) => name),
      5,
      new Set(["家賃収入"]),
    ),
    expenses: figures.real_estate_expenses,
    income_before_blue: figures._detail.real_estate_income_before_deduction,
    blue_deduction: figures._detail.blue_deduction_real_estate,
    income: figures._detail.real_estate_income,
  };
}

// ---------------------------------------------------------------------------
// 月次推移
// ---------------------------------------------------------------------------

/** 月次推移（事業＋不動産。資金移動などの「その他」区分は含めない）。 */
function monthlyRows(yearTx: Transaction[]): TrialBalanceMonth[] {
  const scoped = yearTx.filter((t) => t.income_type !== "other");
  const rows: TrialBalanceMonth[] = [];
  let cumulative = 0;
  for (let month = 1; month <= 12; month++) {
    let revenue = 0;
    let expenses = 0;
    for (const t of scoped) {
      if (Number(t.date.slice(5, 7)) !== month) continue;
      const amount = transactionBusinessAmount(t);
      if (amount >= 0) revenue += amount;
      else expenses += -amount;
    }
    const balance = revenue - expenses;
    cumulative += balance;
    rows.push({ month, revenue, expenses, balance, cumulative });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 貸借対照表（入力に対する算出。buildBalanceSheetPage と同じ算出）
// ---------------------------------------------------------------------------

/** 貸借対照表の勘定キーの表示名（KOA210 4面の科目名）。 */
export const BALANCE_SHEET_ACCOUNT_LABELS: Record<BalanceSheetAccount, string> = {
  cash: "現金",
  checking_deposit: "当座預金",
  time_deposit: "定期預金",
  other_deposit: "その他の預金",
  notes_receivable: "受取手形",
  accounts_receivable: "売掛金",
  securities: "有価証券",
  inventory: "棚卸資産",
  prepaid_expenses: "前払金",
  loans_receivable: "貸付金",
  buildings: "建物",
  building_equipment: "建物附属設備",
  machinery: "機械装置",
  vehicles: "車両運搬具",
  tools_equipment: "工具器具備品",
  land: "土地",
  notes_payable: "支払手形",
  accounts_payable: "買掛金",
  borrowings: "借入金",
  other_payables: "未払金",
  advances_received: "前受金",
  deposits_received: "預り金",
  allowance_for_doubtful_accounts: "貸倒引当金",
  capital: "元入金",
};

/**
 * 貸借対照表入力から試算表の貸借対照表を作る。合計の算出は
 * buildBalanceSheetPage と同じ（期末の負債・資本 = 期末負債 + 事業主借 +
 * 期首元入金 + 青色申告特別控除前の事業所得）。XTX側と違い、不一致でも
 * 例外にせず balanced フラグで返す。
 */
export function buildTrialBalanceSheet(
  input: XtxBalanceSheetInput,
  businessIncomeBeforeBlue: number,
): TrialBalanceBs {
  const assetRows: TrialBalanceBsRow[] = BS_ASSET_ACCOUNTS.map(([key]) => ({
    key,
    label: BALANCE_SHEET_ACCOUNT_LABELS[key],
    opening: input.opening[key] ?? 0,
    closing: input.closing[key] ?? 0,
  }));
  if (input.extraAsset) {
    assetRows.push({
      key: "extra_asset",
      label: input.extraAsset.name,
      opening: input.extraAsset.opening,
      closing: input.extraAsset.closing,
    });
  }
  const liabilityRows: TrialBalanceBsRow[] = BS_LIABILITY_ACCOUNTS.map(([key]) => ({
    key,
    label: BALANCE_SHEET_ACCOUNT_LABELS[key],
    opening: input.opening[key] ?? 0,
    closing: input.closing[key] ?? 0,
  }));
  liabilityRows.push({
    key: "allowance_for_doubtful_accounts",
    label: BALANCE_SHEET_ACCOUNT_LABELS.allowance_for_doubtful_accounts,
    opening: input.opening.allowance_for_doubtful_accounts ?? 0,
    closing: input.closing.allowance_for_doubtful_accounts ?? 0,
  });
  if (input.extraLiability1) {
    liabilityRows.push({
      key: "extra_liability1",
      label: input.extraLiability1.name,
      opening: input.extraLiability1.opening,
      closing: input.extraLiability1.closing,
    });
  }
  if (input.extraLiability2) {
    liabilityRows.push({
      key: "extra_liability2",
      label: input.extraLiability2.name,
      opening: input.extraLiability2.opening,
      closing: input.extraLiability2.closing,
    });
  }
  const capital = input.opening.capital ?? 0;
  const sum = (rows: TrialBalanceBsRow[], side: "opening" | "closing") =>
    rows.reduce((acc, row) => acc + row[side], 0);
  const openingAssets = sum(assetRows, "opening");
  const closingAssets = sum(assetRows, "closing") + input.ownerLoan;
  const openingLiabilitiesCapital = sum(liabilityRows, "opening") + capital;
  const closingLiabilitiesCapital =
    sum(liabilityRows, "closing") + input.ownerBorrowing + capital + businessIncomeBeforeBlue;
  return {
    asset_rows: assetRows,
    liability_rows: liabilityRows,
    owner_loan: input.ownerLoan,
    owner_borrowing: input.ownerBorrowing,
    capital,
    income_before_blue: businessIncomeBeforeBlue,
    opening_assets: openingAssets,
    opening_liabilities_capital: openingLiabilitiesCapital,
    closing_assets: closingAssets,
    closing_liabilities_capital: closingLiabilitiesCapital,
    opening_balanced: openingAssets === openingLiabilitiesCapital,
    closing_balanced: closingAssets === closingLiabilitiesCapital,
  };
}

// ---------------------------------------------------------------------------
// 全体
// ---------------------------------------------------------------------------

/**
 * 対象年の試算表を作る。transactions は全年度分でよく、対象年への
 * 絞り込み（割り当て年度ベース）はここで行う。
 */
export function buildTrialBalance(
  transactions: Transaction[],
  year: number,
  options: TrialBalanceOptions = {},
): TrialBalance {
  const yearTx = filterYear(transactions, year);
  const figures = computeCorrectedFigures(yearTx, year, {
    filingType: options.filingType,
    realEstateBusinessScale: options.realEstateBusinessScale,
  });
  const breakdown = aggregateIncome(yearTx);
  return {
    year,
    business: businessPl(yearTx, figures),
    real_estate: realEstatePl(yearTx, figures),
    other: {
      revenue_lines: revenueLines(yearTx, "other"),
      revenue: breakdown.otherRevenue,
      expense_lines: expenseLinesBySign(yearTx, "other"),
      expenses: breakdown.otherExpenses,
    },
    monthly: monthlyRows(yearTx),
    balance_sheet: options.balanceSheet
      ? buildTrialBalanceSheet(
          options.balanceSheet,
          figures._detail.business_income_before_deduction,
        )
      : null,
  };
}
