import { Transaction } from "@etax/shared";
import { useEffect, useRef, useState } from "react";
import { LedgerTransaction, LedgerTransactionInput } from "@types";
import {
  createLedgerTransaction,
  deleteLedgerTransaction,
  fetchLedgerTransactions,
  ledgerRowToTransaction,
  recordClassificationFeedback,
  updateLedgerTransaction,
} from "@utils/api";
import { emptyDraft, toInput } from "./ledgerOptions";

export type LoadStatus = "loading" | "ready" | "unavailable";

/**
 * useLedgerData.ts — 帳簿（DB）の読み込みと、行の編集・保存・削除・追加。
 *
 * 帳簿（DB）が全年度の正。変更後は全行をそのままアプリ全体の取引へ
 * 反映する（onSyncTransactions）。帳簿は全年度を初回に読み込むだけ
 * （transactions の変化では読み直さない）。
 */
export function useLedgerData(
  onSyncTransactions: ((transactions: Transaction[]) => void) | undefined,
) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [rows, setRows] = useState<LedgerTransaction[]>([]);
  const [edits, setEdits] = useState<Record<number, LedgerTransactionInput>>({});
  const [draft, setDraft] = useState<LedgerTransactionInput>(() =>
    emptyDraft(new Date().getFullYear()),
  );
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  // 削除アニメーション中の行。アニメーションが終わるまで行を残す。
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // 武装した時刻。直後の連打を確定と誤認しないためのガードに使う。
  const deleteArmedAtRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const syncParent = (freshRows: LedgerTransaction[]) => {
    if (!onSyncTransactions) return;
    const merged = freshRows
      .map(ledgerRowToTransaction)
      .sort((a, b) => a.date.localeCompare(b.date));
    onSyncTransactions(merged);
  };

  const applyRows = (freshRows: LedgerTransaction[]) => {
    setRows(freshRows);
    setEdits(Object.fromEntries(freshRows.map((row) => [row.id, toInput(row)])));
    setDeleteArmedId(null);
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
      applyRows(fetched);
      // 追加フォームの初期年度は、データにある最新の割り当て年度に合わせる。
      const latestYear = fetched.reduce((max, row) => Math.max(max, row.fiscal_year), 0);
      if (latestYear > 0) setDraft(emptyDraft(latestYear));
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEdit = (id: number, patch: Partial<LedgerTransactionInput>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const isDirty = (row: LedgerTransaction): boolean => {
    const edit = edits[row.id];
    if (!edit) return false;
    const original = toInput(row);
    return (
      edit.date !== original.date ||
      edit.fiscal_year !== original.fiscal_year ||
      edit.description !== original.description ||
      edit.amount !== original.amount ||
      edit.account !== original.account ||
      edit.category !== original.category ||
      edit.income_type !== original.income_type ||
      edit.tax_category !== original.tax_category ||
      edit.business_ratio_percent !== original.business_ratio_percent ||
      edit.business_ratio_basis !== original.business_ratio_basis
    );
  };

  const handleSave = async (row: LedgerTransaction) => {
    const edit = edits[row.id];
    if (!edit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateLedgerTransaction(row.id, edit);
      const fresh = rows.map((r) => (r.id === row.id ? updated : r));
      applyRows(fresh);
      syncParent(fresh);
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
      const fresh = rows.filter((r) => r.id !== row.id);
      setDeleteArmedId(null);
      // 行はアニメーションで消してから状態へ反映する。
      setDeletingId(row.id);
      setTimeout(() => {
        applyRows(fresh);
        syncParent(fresh);
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
      setError("日付を入力してください");
      return;
    }
    if (!draft.description.trim()) {
      setError("摘要を入力してください");
      return;
    }
    if (draft.amount === 0) {
      setError("金額を入力してください（支出はマイナス）");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createLedgerTransaction(draft);
      const fresh = [...rows, created].sort((a, b) => a.date.localeCompare(b.date));
      applyRows(fresh);
      syncParent(fresh);
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
    rows,
    edits,
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
