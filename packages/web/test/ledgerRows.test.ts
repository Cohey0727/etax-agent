/**
 * ledgerRows.test.ts — 帳簿画面の行と編集中の値の更新の検証。
 *
 * 担保すること:
 * - 1行を保存・追加・削除しても、ほかの行の編集中の値は残る
 * - 更新は常にその時点の行一覧に対して行い、直前の保存結果を巻き戻さない
 */
import { describe, expect, test } from "bun:test";
import {
  editLedgerRow,
  isLedgerRowDirty,
  LedgerRowsState,
  ledgerRowAdded,
  ledgerRowDeleted,
  ledgerRowInput,
  ledgerRowSaved,
  ledgerRowsLoaded,
} from "../src/components/organisms/ledger/LedgerPanel/ledgerRows";
import { LedgerTransaction } from "../src/types";

const row = (id: number, partial: Partial<LedgerTransaction> = {}): LedgerTransaction => ({
  id,
  date: `2025-0${id}-01`,
  fiscal_year: 2025,
  description: `取引${id}`,
  amount: -1000 * id,
  account: "事業口座",
  category: "通信費",
  income_type: "business",
  tax_category: "",
  business_ratio_percent: 100,
  business_ratio_basis: "",
  import_id: null,
  created_at: "",
  ...partial,
});

const withTwoEdits = (): LedgerRowsState => {
  const loaded = ledgerRowsLoaded([row(1), row(2), row(3)]);
  const editedFirst = editLedgerRow(loaded, row(1), { description: "直した摘要" });
  return editLedgerRow(editedFirst, row(2), { amount: -2500 });
};

describe("ledgerRows", () => {
  test("1行を保存しても、ほかの行の編集中の値は残る", () => {
    const state = ledgerRowSaved(withTwoEdits(), row(1, { description: "直した摘要" }));
    expect(isLedgerRowDirty(state, state.rows[0]!)).toBe(false);
    expect(ledgerRowInput(state, state.rows[1]!).amount).toBe(-2500);
    expect(isLedgerRowDirty(state, state.rows[1]!)).toBe(true);
  });

  test("追加・削除しても、ほかの行の編集中の値は残る", () => {
    const added = ledgerRowAdded(withTwoEdits(), row(4, { date: "2025-01-15" }));
    expect(added.rows.map((r) => r.id)).toEqual([1, 4, 2, 3]);
    const deleted = ledgerRowDeleted(added, 1);
    expect(deleted.rows.map((r) => r.id)).toEqual([4, 2, 3]);
    expect(ledgerRowInput(deleted, deleted.rows[1]!).amount).toBe(-2500);
  });

  test("削除の反映は、その前に保存した行を巻き戻さない", () => {
    const saved = ledgerRowSaved(withTwoEdits(), row(2, { amount: -2500 }));
    const deleted = ledgerRowDeleted(saved, 3);
    expect(deleted.rows.map((r) => [r.id, r.amount])).toEqual([
      [1, -1000],
      [2, -2500],
    ]);
  });

  test("編集していない行は保存済みの値をそのまま使う", () => {
    const state = ledgerRowsLoaded([row(1)]);
    expect(isLedgerRowDirty(state, row(1))).toBe(false);
    expect(ledgerRowInput(state, row(1)).description).toBe("取引1");
  });
});
