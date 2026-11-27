import { ledgerRowToTransaction, Transaction } from "@etax/shared";
import { useEffect, useRef, useState } from "react";
import { LedgerTransaction } from "@types";
import {
  createLedgerTransaction,
  deleteLedgerTransaction,
  fetchLedgerTransactions,
  recordClassificationFeedback,
  updateLedgerTransaction,
} from "@utils/api";
import { emptyDraft, ledgerDraftToInput, LedgerRowDraft } from "./ledgerOptions";
import {
  editLedgerRow,
  isLedgerRowDirty,
  LedgerRowsState,
  ledgerRowAdded,
  ledgerRowDeleted,
  ledgerRowSaved,
  ledgerRowsLoaded,
} from "./ledgerRows";

export type LoadStatus = "loading" | "ready" | "unavailable";

/**
 * useLedgerData.ts — 帳簿（DB）の読み込みと、行の編集・保存・削除・追加。
 *
 * 帳簿（DB）が全年度の正。変更後は全行をそのままアプリ全体の取引へ
 * 反映する（onSyncTransactions）。帳簿は全年度を初回に読み込むだけ
 * （transactions の変化では読み直さない）。
 *
 * 行と編集中の値は stateRef と state の両方に同じものを持つ。保存・削除の
 * 完了は通信やアニメーションの後に届くので、そのときの最新の行一覧へ
 * 反映するために stateRef を使い、描画には state を使う。
 */
export function useLedgerData(
  onSyncTransactions: ((transactions: Transaction[]) => void) | undefined,
) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [rowsState, setRowsState] = useState<LedgerRowsState>(() => ledgerRowsLoaded([]));
  const stateRef = useRef(rowsState);
  const [draft, setDraft] = useState<LedgerRowDraft>(() =>
    emptyDraft(new Date().getFullYear()),
  );
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  // 削除アニメーション中の行。アニメーションが終わるまで行を残す。
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // 武装した時刻。直後の連打を確定と誤認しないためのガードに使う。
  const deleteArmedAtRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const commit = (next: LedgerRowsState) => {
    stateRef.current = next;
    setRowsState(next);
  };

  /** 行一覧の変更を確定し、アプリ全体の取引へも反映する。 */
  const commitRows = (next: LedgerRowsState) => {
    commit(next);
    setDeleteArmedId(null);
    if (!onSyncTransactions) return;
    onSyncTransactions(
      next.rows.map(ledgerRowToTransaction).sort((a, b) => a.date.localeCompare(b.date)),
    );
  };

  // 削除の武装は誤操作のもとになるので、4秒で自動解除する。武装した
  // 削除ボタン以外の場所を押した場合も解除する（ボタン側は data 属性で識別）。
  useEffect(() => {
    if (deleteArmedId === null) return;
    const timer = setTimeout(() => setDeleteArmedId(null), 4000);
    const disarmOnOutsidePress = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-delete-arm]")) {
        setDeleteArmedId(null);
      }
    };
    document.addEventListener("pointerdown", disarmOnOutsidePress);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", disarmOnOutsidePress);
    };
  }, [deleteArmedId]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    void (async () => {
      const fetched = await fetchLedgerTransactions();
      if (cancelled) return;
      if (!fetched) {
        setStatus("unavailable");
        return;
      }
      const loaded = ledgerRowsLoaded(fetched);
      stateRef.current = loaded;
      setRowsState(loaded);
      // 追加フォームの初期年度は、データにある最新の割り当て年度に合わせる。
      const latestYear = fetched.reduce((max, row) => Math.max(max, row.fiscal_year), 0);
      if (latestYear > 0) setDraft(emptyDraft(latestYear));
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEdit = (row: LedgerTransaction, patch: Partial<LedgerRowDraft>) => {
    commit(editLedgerRow(stateRef.current, row, patch));
  };

  const isDirty = (row: LedgerTransaction): boolean => isLedgerRowDirty(rowsState, row);

  const handleSave = async (row: LedgerTransaction) => {
    const edit = stateRef.current.edits[row.id];
    if (!edit || busy) return;
    const converted = ledgerDraftToInput(edit);
    if ("error" in converted) {
      setError(converted.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateLedgerTransaction(row.id, converted.input);
      commitRows(ledgerRowSaved(stateRef.current, updated));
      // 科目を直したら学習履歴にも記録し、次回から同じ摘要は直した科目で判定されるようにする。
      if (updated.category !== row.category && updated.category !== "未分類") {
        void recordClassificationFeedback(updated.description, updated.category);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (row: LedgerTransaction) => {
    if (deleteArmedId !== row.id) {
      setDeleteArmedId(row.id);
      deleteArmedAtRef.current = Date.now();
      return;
    }
    // 武装直後（700ms以内）の再押下は、誤った連打として無視する。
    if (Date.now() - deleteArmedAtRef.current < 700) return;
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteLedgerTransaction(row.id);
      setDeleteArmedId(null);
      // 行はアニメーションで消してから状態へ反映する。
      setDeletingId(row.id);
      setTimeout(() => {
        commitRows(ledgerRowDeleted(stateRef.current, row.id));
        setDeletingId(null);
      }, 380);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (busy) return;
    const converted = ledgerDraftToInput(draft);
    if ("error" in converted) {
      setError(converted.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createLedgerTransaction(converted.input);
      commitRows(ledgerRowAdded(stateRef.current, created));
      setDraft(emptyDraft(created.fiscal_year));
      // 手入力で科目を選んだ行も学習履歴に記録する（次回の判定で優先される）。
      if (created.category !== "未分類") {
        void recordClassificationFeedback(created.description, created.category);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return {
    status,
    rows: rowsState.rows,
    edits: rowsState.edits,
    draft,
    setDraft,
    deleteArmedId,
    deletingId,
    error,
    setError,
    busy,
    isDirty,
    handleEdit,
    handleSave,
    handleDelete,
    handleAdd,
  };
}
