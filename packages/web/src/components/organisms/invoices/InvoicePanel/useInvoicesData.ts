import { useCallback, useEffect, useState } from "react";
import { InvoiceInput, InvoiceRecord, InvoiceSearchFilters } from "@types";
import {
  createInvoice,
  createInvoiceCorrection,
  deleteInvoice,
  downloadInvoicePdf,
  fetchInvoices,
  issueInvoice,
  updateInvoice,
} from "@utils/api";
import { validateInput } from "./invoiceOptions";

export type LoadStatus = "loading" | "ready" | "unavailable";

/**
 * useInvoicesData.ts — 請求書の読み込みと CRUD・発行・修正・PDF の管理。
 * 発行済みの帳票は不変で、画面側からも更新・削除の導線を出さない。
 */
export function useInvoicesData() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<InvoiceSearchFilters>({});
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);

  const reload = useCallback(
    async (nextFilters: InvoiceSearchFilters): Promise<boolean> => {
      const fetched = await fetchInvoices(nextFilters);
      if (!fetched) return false;
      setInvoices(fetched);
      return true;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      const ok = await reload(filters);
      if (cancelled) return;
      setStatus(ok ? "ready" : "unavailable");
    })();
    return () => {
      cancelled = true;
    };
    // 初回だけ読み込む。以後の再検索は applyFilters から明示的に行う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 現在の検索条件のまま一覧を再取得する（消込後の状態反映用）。 */
  const refreshList = useCallback(async () => {
    await reload(filters);
  }, [reload, filters]);

  const applyFilters = async (next: InvoiceSearchFilters) => {
    setFilters(next);
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
    const problem = validateInput(input);
    if (problem) {
      setError(problem);
      return null;
    }
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const created = await createInvoice(input);
      await reload(filters);
      return created;
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleUpdate = async (id: number, input: InvoiceInput): Promise<boolean> => {
    const problem = validateInput(input);
    if (problem) {
      setError(problem);
      return false;
    }
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await updateInvoice(id, input);
      await reload(filters);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (invoice: InvoiceRecord): Promise<boolean> => {
    if (deleteArmedId !== invoice.id) {
      setDeleteArmedId(invoice.id);
      return false;
    }
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await deleteInvoice(invoice.id);
      await reload(filters);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
      return false;
    } finally {
      setBusy(false);
      setDeleteArmedId(null);
    }
  };

  const handleIssue = async (id: number): Promise<InvoiceRecord | null> => {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const issued = await issueInvoice(id);
      await reload(filters);
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
      await reload(filters);
      return draft;
    } catch (e) {
      setError(e instanceof Error ? e.message : "修正用下書きの作成に失敗しました");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async (invoice: InvoiceRecord) => {
    setError(null);
    try {
      await downloadInvoicePdf(invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDFのダウンロードに失敗しました");
    }
  };

  return {
    status,
    invoices,
    error,
    busy,
    filters,
    deleteArmedId,
    setDeleteArmedId,
    refreshList,
    applyFilters,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleIssue,
    handleCorrect,
    handleDownloadPdf,
  };
}
