import { Transaction } from "@etax/shared";
import {
  BreakdownEntry,
  DeductionPatch,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { LedgerTransaction } from "@types";
import {
  ledgerRowToTransaction,
  transactionToLedgerInput,
  updateLedgerTransaction,
} from "@utils/api";

/** エージェント由来の控除パッチの内訳に、保存用の id を補う。 */
export const withEntryIds = (patch: DeductionPatch): DeductionPatch => {
  if (!patch.entries) return patch;
  const entries: DeductionPatch["entries"] = {};
  for (const [key, list] of Object.entries(patch.entries)) {
    if (!list) continue;
    entries[key as keyof typeof entries] = list.map(
      (e, i): BreakdownEntry => ({
        id: e.id || `agent-${key}-${i}`,
        recipient: e.recipient ?? "",
        amount: typeof e.amount === "number" ? e.amount : 0,
      }),
    );
  }
  return { ...patch, entries };
};

/**
 * 取込プレビューで付け直した科目（科目判定パネルの編集）を、サーバーから
 * 読み直した帳簿の行へ反映する。日付・金額・摘要・口座が一致する行を
 * 対応付け（同一キーは複数行ありうるので消費済みは再利用しない）、
 * 科目・収入区分が変わった行だけ帳簿へも保存する。
 */
export async function applyCsvClassificationEdits(
  rows: LedgerTransaction[],
  imported: Transaction[],
): Promise<Transaction[]> {
  const used = new Set<number>();
  const result = rows.map((row) => ({ ...row }));
  for (const tx of imported) {
    const index = result.findIndex(
      (row, i) =>
        !used.has(i) &&
        row.date === tx.date &&
        row.amount === tx.amount &&
        row.description === tx.description &&
        row.account === tx.account,
    );
    if (index < 0) continue;
    used.add(index);
    const row = result[index] as LedgerTransaction;
    if (row.category === tx.category && row.income_type === tx.income_type) continue;
    const edited: LedgerTransaction = {
      ...row,
      category: tx.category,
      income_type: tx.income_type,
    };
    result[index] = edited;
    try {
      result[index] = await updateLedgerTransaction(
        edited.id,
        transactionToLedgerInput(ledgerRowToTransaction(edited)),
      );
    } catch {
      // 帳簿への保存に失敗しても、画面表示は編集後の値で続ける
    }
  }
  return result.map(ledgerRowToTransaction);
}
