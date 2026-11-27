/**
 * generateIncomeTaxXtx.ts — 所得税の申告等データ（XTX）を生成する（services/etax）。
 * 計算（@etax/shared の決定的な関数）→ XTX の組み立て → 公式 XSD 検証を
 * 1つの流れで行う。生成物は署名なしの組み込み用データで、送信（マイナンバー
 * カード署名）は e-Tax 側で本人が行う。
 */
import {
  buildXtxFiling,
  computeCorrectedFigures,
  computeIncomeTax,
  computeManualIncomes,
  filterYear,
  normalizeMiscIncomeInput,
  normalizeSalaryIncomeInput,
  normalizeTransactions,
  statementCategoryTotals,
} from "@etax/shared";
import { ExportXtxRequest } from "../../schemas/etax";
import {
  XtxInputError,
  balanceSheetFromWire,
  depreciationFromWire,
  resolveAgriculture,
  resolveExpandedTax,
  toTaxpayer,
} from "./xtxInputs";
import { xsdWarningOrThrow } from "./xsdValidator";

/** 生成した XTX。xsdWarning は公式 XSD 検証を行えなかった場合の理由（通れば null）。 */
export interface GeneratedXtx {
  filename: string;
  xtx: string;
  xsdWarning: string | null;
}

/**
 * 所得税の XTX を生成して公式 XSD で検証する。入力が原因で組み立てられなければ
 * XtxInputError、スキーマ違反なら XtxXsdInvalidError を投げる。
 */
export async function generateIncomeTaxXtx(body: ExportXtxRequest): Promise<GeneratedXtx> {
  const transactions = filterYear(normalizeTransactions(body.transactions ?? []), body.year);
  const agriculture = resolveAgriculture(body.agriculture);
  const figures = computeCorrectedFigures(transactions, body.year, {
    filingType: body.filing_type,
    realEstateBusinessScale: body.real_estate_business_scale,
    agriculture: agriculture.input,
  });
  const depreciation = depreciationFromWire(body);
  const balanceSheet = balanceSheetFromWire(body);
  const miscIncome = normalizeMiscIncomeInput(body.misc_income);
  const salaryIncome = normalizeSalaryIncomeInput(body.salary_income);
  const ledgerIncome =
    figures._detail.business_income +
    figures._detail.real_estate_income +
    figures._detail.agriculture_income;
  const manual = computeManualIncomes(body.year, salaryIncome, miscIncome, ledgerIncome);
  const expandedTax = resolveExpandedTax(body.expanded_income, body.tax_credits);
  const tax = computeIncomeTax({
    year: body.year,
    totalIncome: ledgerIncome + manual.total + expandedTax.comprehensiveAddition,
    deductions: body.deductions,
    taxCredits: expandedTax.taxCredits,
    separateTaxation: expandedTax.separateTaxation,
  });
  let xtx: string;
  try {
    xtx = buildXtxFiling({
      year: body.year,
      amendment: body.amendment,
      submissionDate: body.submission_date,
      taxpayer: toTaxpayer(body.taxpayer),
      figures,
      filingType: body.filing_type,
      depreciation,
      balanceSheet,
      deductionInputs: body.deductions,
      miscIncome,
      salaryIncome,
      expandedIncome: expandedTax.input,
      agriculture: agriculture.statement
        ? {
            statement: agriculture.statement,
            blueDeduction: figures._detail.blue_deduction_agriculture,
          }
        : undefined,
      tax,
      categoryTotals: {
        business: statementCategoryTotals(transactions, "business"),
        realEstate: statementCategoryTotals(transactions, "real_estate"),
      },
      withholdingTax: body.withholding_tax + expandedTax.withholdingAddition,
      prepaidTax: body.prepaid_tax,
      originalThirdPeriodTax: body.original_third_period_tax,
    });
  } catch (e) {
    throw new XtxInputError(e instanceof Error ? e.message : "XTXの生成に失敗しました");
  }
  return {
    filename: `etax-shotoku-${body.year}${body.amendment ? "-shusei" : "-kakutei"}.xtx`,
    xtx,
    xsdWarning: await xsdWarningOrThrow(xtx),
  };
}
