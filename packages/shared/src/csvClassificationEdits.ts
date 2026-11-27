/**
 * csvClassificationEdits.ts — 取込プレビューで付け直した科目を帳簿の行へ反映する。
 */
import { Transaction } from "./types";

/** 取込分との対応付けと科目の反映に使う、帳簿の行の項目。 */
export interface ClassifiableLedgerRow {
  date: string;
  amount: number;
  description: string;
  account: string;
  category: string;
  income_type: string;
}

/**
 * 取込プレビューで付け直した科目（科目判定の確定）を、サーバーから読み直した
 * 帳簿の行へ反映する。日付・金額・摘要・口座が一致する行を対応付け（同じ組み合わせは
 * 複数行ありうるので、対応付けた行は再利用しない）、科目・収入区分が変わった行だけを
 * saveRow で保存する。保存に失敗した行も、返す行は編集後の値にする。
 */
export async function applyCsvClassificationEdits<R extends ClassifiableLedgerRow>(
  rows: readonly R[],
  imported: readonly Transaction[],
  saveRow: (edited: R) => Promise<R>,
): Promise<R[]> {
  const used = new Set<number>();
  const result = [...rows];
  for (const tx of imported) {
    const index = result.findIndex(
      (row, i) =>
        !used.has(i) &&
        row.date === tx.date &&
        row.amount === tx.amount &&
        row.description === tx.description &&
        row.account === tx.account,
    );
    const row = result[index];
    if (row === undefined) continue;
    used.add(index);
    if (row.category === tx.category && row.income_type === tx.income_type) continue;
    const edited: R = { ...row, category: tx.category, income_type: tx.income_type };
    result[index] = edited;
    try {
      result[index] = await saveRow(edited);
    } catch {
      // 帳簿への保存に失敗しても、画面表示は編集後の値で続ける
    }
  }
  return result;
}
