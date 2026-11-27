/**
 * useInvoicesData.ts — 請求書の読み込みと CRUD・発行・修正・PDF の管理。
 * 発行済みの帳票は不変で、画面側からも更新・削除の導線を出さない。
 */
import { validateInvoiceInput } from "@etax/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  InvoiceInput,
  InvoiceRecord,
  InvoiceSearchFilters,
  createInvoice,
  createInvoiceCorrection,
  deleteInvoice,
  downloadApiFile,
  fetchInvoices,
  invoicePdfFilename,
  invoicePdfPath,
  issueInvoice,
  shareFile,
  updateInvoice,
} from "@/api";

export type LoadStatus = "loading" | "ready" | "unavailable";

export function useInvoicesData() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filtersRef = useRef<InvoiceSearchFilters>({});

  const reload = useCallback(async (nextFilters: InvoiceSearchFilters): Promise<boolean> => {
    const fetched = await fetchInvoices(nextFilters);
    if (!fetched) return false;
    setInvoices(fetched);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await reload({});
      if (cancelled) return;
      setStatus(ok ? "ready" : "unavailable");
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  /** 現在の検索条件のまま一覧を再取得する（消込後の状態反映用）。 */
  const refreshList = useCallback(async () => {
    await reload(filtersRef.current);
  }, [reload]);

  const applyFilters = async (next: InvoiceSearchFilters) => {
    filtersRef.current = next;
    setBusy(true);
    setError(null);
    try {
      const ok = await reload(next);
      if (!ok) setError("請求書の取得に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (input: InvoiceInput): Promise<InvoiceRecord | null> => {
    const problem = validateInvoiceInput(input);
    if (problem) {
      setError(problem);
      return null;
    }
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const created = await createInvoice(input);
      await reload(filtersRef.current);
      return created;
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (id: number, input: InvoiceInput): Promise<boolean> => {
    const problem = validateInvoiceInput(input);
    if (problem) {
      setError(problem);
      return false;
    }
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await updateInvoice(id, input);
      await reload(filtersRef.current);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (invoice: InvoiceRecord): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await deleteInvoice(invoice.id);
      await reload(filtersRef.current);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleIssue = async (id: number): Promise<InvoiceRecord | null> => {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const issued = await issueInvoice(id);
      await reload(filtersRef.current);
      return issued;
    } catch (e) {
      setError(e instanceof Error ? e.message : "発行に失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleCorrect = async (id: number): Promise<InvoiceRecord | null> => {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const draft = await createInvoiceCorrection(id);
      await reload(filtersRef.current);
      return draft;
    } catch (e) {
      setError(e instanceof Error ? e.message : "修正用下書きの作成に失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  /** PDF を認証付きで取得し、共有シートを開く（保存・送信先の選択は利用者）。 */
  const handleSharePdf = async (invoice: InvoiceRecord) => {
    setError(null);
    try {
      const file = await downloadApiFile(invoicePdfPath(invoice), invoicePdfFilename(invoice));
      await shareFile(file, "application/pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDFの取得に失敗しました");
    }
  };

  return {
    status,
    invoices,
    error,
    busy,
    refreshList,
    applyFilters,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleIssue,
    handleCorrect,
    handleSharePdf,
  };
}
