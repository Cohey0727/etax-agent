import { FilingFigures } from "@etax/shared";

/** 要約の1行（ラベルと金額）。 */
export interface IncomeSummaryRow {
  label: string;
  amount: number;
}

/**
 * 見出しの統計カード（収入合計・支出合計・収支・所得合計）。収入・支出は
 * 帳簿の事業＋不動産だけを数える。口座の生の出入り（チャージ・振替・投資・
 * カード決済などの「その他」区分）まで合計すると実態とかけ離れるため。
 */
export function incomeStatCards(figures: FilingFigures, isWhite: boolean): IncomeSummaryRow[] {
  const c = figures.corrected;
  const incomeTotal = c.business_revenue + c.real_estate_revenue;
  const expenseTotal = c.business_expenses + c.real_estate_expenses;
  return [
    { label: "収入合計", amount: incomeTotal },
    { label: "支出合計", amount: expenseTotal },
    { label: "収支（差引）", amount: incomeTotal - expenseTotal },
    { label: totalIncomeLabel(isWhite), amount: figures.totalIncome },
  ];
}

/**
 * 収支から所得合計までの内訳。行を足すと所得合計（合計所得金額の総合課税分）に
 * なる。給与・雑所得・農業・配当・一時は金額があるときだけ出す（雑所得の赤字も出す）。
 */
export function incomeBridgeRows(figures: FilingFigures, isWhite: boolean): IncomeSummaryRow[] {
  const c = figures.corrected;
  const { manual, expanded } = figures;
  const optional: IncomeSummaryRow[] = [
    {
      label: isWhite ? "農業所得" : "農業所得（青色申告特別控除前）",
      amount: c._detail.agriculture_income_before_deduction,
    },
  ];
  const additions: IncomeSummaryRow[] = [
    { label: "給与所得", amount: manual.salary },
    { label: "雑所得（公的年金等）", amount: manual.pension },
    { label: "雑所得（業務）", amount: manual.miscBusiness },
    { label: "雑所得（その他）", amount: manual.miscOther },
    { label: "配当所得（総合課税分）", amount: expanded.dividend.comprehensiveIncome },
    { label: "一時所得（2分の1）", amount: expanded.temp.includedAmount },
  ];
  return [
    { label: "事業の差引", amount: c.business_revenue - c.business_expenses },
    { label: "不動産の差引", amount: c.real_estate_revenue - c.real_estate_expenses },
    ...optional.filter((row) => row.amount !== 0),
    {
      label: isWhite ? "青色申告特別控除（白色申告のためなし）" : "青色申告特別控除",
      amount: -c.blue_deduction,
    },
    ...additions.filter((row) => row.amount !== 0),
  ];
}

/** 所得合計の行・カードのラベル。青色は控除後の金額であることを添える。 */
export function totalIncomeLabel(isWhite: boolean): string {
  return isWhite ? "所得合計" : "所得合計（青色控除後）";
}
