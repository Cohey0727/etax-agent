/**
 * incomeTaxFiling.ts — 帳簿と申告入力から所得税額を求める配線。
 *
 * 合計所得金額（総合課税分）は、経常所得（事業・不動産・農業・給与・雑・配当）に
 * 一時所得を損益通算してから一時所得を1/2にして求める（comprehensiveTotalIncome）。
 * XTX・申告書の紙イメージ・所得税の計算 API・MCP が同じ計算を使い、呼び出し側で
 * 所得を手で足さない。
 */
import {
  AgricultureInput,
  AgricultureStatement,
  computeAgricultureStatement,
  isAgricultureEmpty,
} from "./agriculture";
import {
  DeductionInputs,
  IncomeTaxResult,
  ManualIncomeBreakdown,
  MiscIncomeInput,
  SalaryIncomeInput,
  TaxCreditInputs,
  computeIncomeTax,
  computeManualIncomes,
} from "./deductions";
import {
  ExpandedIncomeBreakdown,
  ExpandedIncomeInput,
  comprehensiveTotalIncome,
  computeExpandedIncomes,
  expandedWithholdingTotal,
  resolveTaxCreditInputs,
} from "./expandedIncome";
import { CorrectedFigures, FilingType, computeCorrectedFigures } from "./taxcalc";
import { Transaction } from "./types";

export interface ComprehensiveIncomeTaxInput {
  year: number;
  /**
   * 経常所得の合計（事業・不動産・農業・給与・雑など。配当・一時所得は含めない）。
   * 事業・不動産の損失は負のまま渡す。
   */
  ordinaryIncome: number;
  /** 配当・一時・株式等譲渡の計算内訳。無ければ省略 */
  expanded?: ExpandedIncomeBreakdown;
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
}

/**
 * 経常所得に配当所得（赤字は通算しないので0が下限）を加え、一時所得を損益通算
 * してから1/2にして合計所得金額を求め、所得税額を計算する。配当控除の対象額と
 * 申告分離課税の所得は拡張所得の内訳から渡す。
 */
export function computeComprehensiveIncomeTax(input: ComprehensiveIncomeTaxInput): IncomeTaxResult {
  const { expanded } = input;
  const dividendIncome = expanded ? Math.max(expanded.dividend.comprehensiveIncome, 0) : 0;
  return computeIncomeTax({
    year: input.year,
    totalIncome: comprehensiveTotalIncome(
      input.ordinaryIncome + dividendIncome,
      expanded?.temp.amount ?? 0,
    ),
    deductions: input.deductions,
    taxCredits: expanded ? resolveTaxCreditInputs(input.taxCredits, expanded) : input.taxCredits,
    separateTaxation: expanded
      ? { stockIncome: expanded.separateStockIncome, dividendIncome: expanded.separateDividendIncome }
      : undefined,
  });
}

/** 帳簿の取引と申告入力（所得税の計算に使う分）。 */
export interface IncomeTaxFilingInput {
  year: number;
  /** 対象年の取引（filterYear 済み） */
  transactions: Transaction[];
  filingType?: FilingType;
  realEstateBusinessScale?: boolean;
  /** 農業所得の入力。帳簿の取引とは混ぜない申告入力 */
  agriculture?: AgricultureInput;
  salaryIncome: SalaryIncomeInput;
  miscIncome: MiscIncomeInput;
  /** 配当・一時・株式等譲渡の入力。無ければ省略 */
  expandedIncome?: ExpandedIncomeInput;
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
}

export interface IncomeTaxFiling {
  /** 帳簿の申告数値（computeCorrectedFigures の結果） */
  figures: CorrectedFigures;
  /** 農業所得の決算書の計算内訳。農業所得の入力が無ければ undefined */
  agricultureStatement?: AgricultureStatement;
  /** 給与・雑所得の計算内訳 */
  manual: ManualIncomeBreakdown;
  /** 配当・一時・株式等譲渡の計算内訳。入力が無ければ undefined */
  expanded?: ExpandedIncomeBreakdown;
  tax: IncomeTaxResult;
  /** 申告する配当・株式等の源泉徴収税額（申告書の源泉徴収税額に加える） */
  expandedWithholding: number;
}

/** 帳簿の取引と申告入力から、所得の内訳と所得税額を求める。 */
export function computeIncomeTaxFiling(input: IncomeTaxFilingInput): IncomeTaxFiling {
  const agricultureStatement =
    input.agriculture && !isAgricultureEmpty(input.agriculture)
      ? computeAgricultureStatement(input.agriculture)
      : undefined;
  const figures = computeCorrectedFigures(input.transactions, input.year, {
    filingType: input.filingType,
    realEstateBusinessScale: input.realEstateBusinessScale,
    agriculture: input.agriculture,
  });
  const ledgerIncome =
    figures._detail.business_income +
    figures._detail.real_estate_income +
    figures._detail.agriculture_income;
  const manual = computeManualIncomes(input.year, input.salaryIncome, input.miscIncome, ledgerIncome);
  const expanded = input.expandedIncome ? computeExpandedIncomes(input.expandedIncome) : undefined;
  const tax = computeComprehensiveIncomeTax({
    year: input.year,
    ordinaryIncome: ledgerIncome + manual.total,
    expanded,
    deductions: input.deductions,
    taxCredits: input.taxCredits,
  });
  return {
    figures,
    agricultureStatement,
    manual,
    expanded,
    tax,
    expandedWithholding: expanded ? expandedWithholdingTotal(expanded) : 0,
  };
}
