/**
 * useReconciliationData.ts — 発行済み請求書の消込情報（消込済み一覧・
 * 自動推測の候補）の読み込みと、消込・解除の実行。
 * 入金取引の候補は AppContext の帳簿（金額がプラスの行）から出す。
 */
import { useCallback, useEffect, useState } from "react";
import {
  CreateInvoicePaymentInput,
  InvoicePaymentsResult,
  InvoiceRecord,
  ReconciliationCandidateRecord,
  createInvoicePayment,
  deleteInvoicePayment,
  fetchInvoicePayments,
  fetchPaymentSuggestions,
} from "@/api";
import { useAppState } from "@/state/AppContext";

export function useReconciliationData(invoice: InvoiceRecord, onChanged: () => void) {
  const invoiceId = invoice.id;
  const isIssued = invoice.status === "issued";
  const { ledgerRows } = useAppState();
  const [result, setResult] = useState<InvoicePaymentsResult | null>(null);
  const [candidates, setCandidates] = useState<ReconciliationCandidateRecord[]>([]);
  const [loading, setLoading] = useState(isIssued);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incomeTransactions = (ledgerRows ?? []).filter((tx) => tx.amount > 0);

  const load = useCallback(async () => {
    const [payments, suggested] = await Promise.all([
      fetchInvoicePayments(invoiceId),
      fetchPaymentSuggestions(invoiceId),
    ]);
    setResult(payments);
    setCandidates(suggested ?? []);
  }, [invoiceId]);

  useEffect(() => {
    if (!isIssued) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isIssued, load]);

  const applyPayment = async (input: CreateInvoicePaymentInput): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const next = await createInvoicePayment(invoiceId, input);
      setResult(next);
      onChanged();
      setCandidates((await fetchPaymentSuggestions(invoiceId)) ?? []);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "消込に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const releasePayment = async (paymentId: number): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await deleteInvoicePayment(invoiceId, paymentId);
      setResult(next);
      onChanged();
      setCandidates((await fetchPaymentSuggestions(invoiceId)) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "消込の解除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return {
    result,
    candidates,
    incomeTransactions,
    loading,
    busy,
    error,
    applyPayment,
    releasePayment,
  };
}
