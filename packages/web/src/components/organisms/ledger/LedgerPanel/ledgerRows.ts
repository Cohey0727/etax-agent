import { LedgerTransaction, LedgerTransactionInput } from "@types";
import { toInput } from "./ledgerOptions";

/**
 * ledgerRows.ts — 帳簿画面の行一覧と、行ごとの編集中の値。
 *
 * 編集中の値は手を入れた行だけが持つ。保存・追加・削除はその行だけを
 * 入れ替え、ほかの行の編集中の値には触れない。
 */
export interface LedgerRowsState {
  rows: LedgerTransaction[];
  /** 手を入れた行の入力中の値（行 ID ごと）。保存したら外す。 */
  edits: Record<number, LedgerTransactionInput>;
}

export const ledgerRowsLoaded = (rows: LedgerTransaction[]): LedgerRowsState => ({
  rows,
  edits: {},
});

/** 行の入力欄に出す値。手を入れていなければ保存済みの値。 */
export const ledgerRowInput = (
  state: LedgerRowsState,
  row: LedgerTransaction,
): LedgerTransactionInput => state.edits[row.id] ?? toInput(row);

export const editLedgerRow = (
  state: LedgerRowsState,
  row: LedgerTransaction,
  patch: Partial<LedgerTransactionInput>,
): LedgerRowsState => ({
  ...state,
  edits: { ...state.edits, [row.id]: { ...ledgerRowInput(state, row), ...patch } },
});

export const ledgerRowSaved = (
  state: LedgerRowsState,
  updated: LedgerTransaction,
): LedgerRowsState => ({
  rows: state.rows.map((row) => (row.id === updated.id ? updated : row)),
  edits: withoutEdit(state.edits, updated.id),
});

export const ledgerRowAdded = (
  state: LedgerRowsState,
  created: LedgerTransaction,
): LedgerRowsState => ({
  ...state,
  rows: [...state.rows, created].sort((a, b) => a.date.localeCompare(b.date)),
});

export const ledgerRowDeleted = (state: LedgerRowsState, id: number): LedgerRowsState => ({
  rows: state.rows.filter((row) => row.id !== id),
  edits: withoutEdit(state.edits, id),
});

/** 入力中の値が保存済みの値と違うか。 */
export function isLedgerRowDirty(state: LedgerRowsState, row: LedgerTransaction): boolean {
  const edit = state.edits[row.id];
  if (!edit) return false;
  const original = toInput(row);
  return (Object.keys(original) as (keyof LedgerTransactionInput)[]).some(
    (key) => edit[key] !== original[key],
  );
}

function withoutEdit(
  edits: Record<number, LedgerTransactionInput>,
  id: number,
): Record<number, LedgerTransactionInput> {
  const next = { ...edits };
  delete next[id];
  return next;
}
