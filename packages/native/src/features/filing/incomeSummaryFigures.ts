/**
 * incomeSummaryFigures.ts — 総合タブと収支タブに出す所得の要約（収支から所得合計まで）。
 *
 * 所得合計は所得税の計算に渡す合計所得金額と同じ式で求め、内訳の行を
 * 足すと所得合計になるようにする。そのため帳簿の集計は農業所得の入力を
 * 含めた申告数値（青色申告特別控除の上限と配分が変わる）を受け取る。
 */
import { CorrectedFigures, FilingType, ManualIncomeBreakdown } from "@etax/shared";

export interface IncomeSummaryRow {
  label: string;
  amount: number;
}

export interface IncomeSummaryFigures {
  /** 収入合計（事業＋不動産。資金移動などの「その他」区分は含めない） */
  incomeTotal: number;
  /** 支出合計（事業＋不動産） */
  expenseTotal: number;
  /** 合計所得金額（所得税の計算に使う値） */
  totalIncome: number;
  /** 収支から所得合計までの内訳。足すと totalIncome になる */
  bridgeRows: readonly IncomeSummaryRow[];
}

/**
 * 申告数値と手入力の所得から所得の要約を作る。
 * comprehensiveAddition は配当・一時所得のうち総合課税で合計所得に入る額。
 */
export function summarizeIncome(
  figures: CorrectedFigures,
  manual: ManualIncomeBreakdown,
  comprehensiveAddition: number,
  filingType: FilingType,
): IncomeSummaryFigures {
  const detail = figures._detail;
  const totalIncome =
    detail.business_income +
    detail.real_estate_income +
    detail.agriculture_income +
    manual.total +
    comprehensiveAddition;
  // 雑所得の計が区分ごとの金額の和と違う分（他の所得と通算しない赤字など）
  const miscRest = manual.miscTotal - (manual.pension + manual.miscBusiness + manual.miscOther);
  const manualRows: readonly IncomeSummaryRow[] = [
    { label: "給与所得", amount: manual.salary },
    { label: "雑所得（公的年金等）", amount: manual.pension },
    { label: "雑所得（業務）", amount: manual.miscBusiness },
    { label: "雑所得（その他）", amount: manual.miscOther },
    { label: "雑所得の赤字のうち他の所得と通算しない額", amount: miscRest },
    { label: "配当・一時所得（総合課税分）", amount: comprehensiveAddition },
  ];
  const agricultureRows: readonly IncomeSummaryRow[] = [
    { label: "農業所得（青色申告特別控除前）", amount: detail.agriculture_income_before_deduction },
  ];
  return {
    incomeTotal: figures.business_revenue + figures.real_estate_revenue,
    expenseTotal: figures.business_expenses + figures.real_estate_expenses,
    totalIncome,
    bridgeRows: [
      { label: "事業の差引", amount: figures.business_revenue - figures.business_expenses },
      { label: "不動産の差引", amount: figures.real_estate_revenue - figures.real_estate_expenses },
      ...agricultureRows.filter(isNonZero),
      {
        label:
          filingType === "white" ? "青色申告特別控除（白色申告のためなし）" : "青色申告特別控除",
        amount: -figures.blue_deduction,
      },
      ...manualRows.filter(isNonZero),
    ],
  };
}

function isNonZero(row: IncomeSummaryRow): boolean {
  return row.amount !== 0;
}
