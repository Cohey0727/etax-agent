/**
 * generateIncomeTaxXtx.ts — 所得税の申告等データ（XTX）を生成する（services/etax）。
 * 計算（@etax/shared の computeIncomeTaxFiling）→ XTX の組み立て → 公式 XSD 検証を
 * 1つの流れで行い、REST と MCP の両方から使う。生成物は署名なしの組み込み用
 * データで、送信（マイナンバーカード署名）は e-Tax 側で本人が行う。
 */
import { buildXtxFiling, computeIncomeTaxFiling, statementCategoryTotals } from "@etax/shared";
import { IncomeTaxXtxRequest, XtxInputError } from "./xtxInputs";
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
export async function generateIncomeTaxXtx(request: IncomeTaxXtxRequest): Promise<GeneratedXtx> {
  const { filing } = request;
  const computed = computeIncomeTaxFiling(filing);
  let xtx: string;
  try {
    xtx = buildXtxFiling({
      year: filing.year,
      amendment: request.amendment,
      submissionDate: request.submissionDate,
      taxpayer: request.taxpayer,
      figures: computed.figures,
      filingType: filing.filingType,
      depreciation: request.depreciation,
      balanceSheet: request.balanceSheet,
      deductionInputs: filing.deductions,
      miscIncome: filing.miscIncome,
      salaryIncome: filing.salaryIncome,
      expandedIncome: filing.expandedIncome,
      agriculture: computed.agricultureStatement
        ? {
            statement: computed.agricultureStatement,
            blueDeduction: computed.figures._detail.blue_deduction_agriculture,
          }
        : undefined,
      tax: computed.tax,
      categoryTotals: {
        business: statementCategoryTotals(filing.transactions, "business"),
        realEstate: statementCategoryTotals(filing.transactions, "real_estate"),
      },
      withholdingTax: request.withholdingTax + computed.expandedWithholding,
      prepaidTax: request.prepaidTax,
      originalThirdPeriodTax: request.originalThirdPeriodTax,
    });
  } catch (e) {
    throw new XtxInputError(e instanceof Error ? e.message : "XTXの生成に失敗しました");
  }
  return {
    filename: `etax-shotoku-${filing.year}${request.amendment ? "-shusei" : "-kakutei"}.xtx`,
    xtx,
    xsdWarning: await xsdWarningOrThrow(xtx),
  };
}
