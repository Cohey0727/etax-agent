import { useCallback, useEffect, useState } from "react";
import {
  CreateInvoicePaymentInput,
  InvoicePaymentsResult,
  InvoiceRecord,
  LedgerTransaction,
  ReconciliationCandidateRecord,
} from "@types";
import {
  createInvoicePayment,
  deleteInvoicePayment,
  fetchInvoicePayments,
  fetchLedgerTransactions,
  fetchPaymentSuggestions,
} from "@utils/api";

/**
 * useReconciliationData.ts — 請求書の入金消込データ（消込一覧・候補・入金取引）。
 *
 * 候補は推測の提示だけで、消込は applyPayment（作成 API）の明示的な呼び出し
 * でのみ確定する。消込・解除のたびに親の一覧も更新する（onChanged）。
 */
export function useReconciliationData(invoice: InvoiceRecord, onChanged: () => void) {
  const invoiceId = invoice.id;
  const isIssued = invoice.status === "issued";
  const [result, setResult] = useState<InvoicePaymentsResult | null>(null);
  const [candidates, setCandidates] = useState<ReconciliationCandidateRecord[]>([]);
  const [incomeTransactions, setIncomeTransactions] = useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = useState(isIssued);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [payments, suggested, transactions] = await Promise.all([
      fetchInvoicePayments(invoiceId),
      fetchPaymentSuggestions(invoiceId),
      fetchLedgerTransactions(),
    ]);
    setResult(payments);
    setCandidates(suggested ?? []);
    setIncomeTransactions((transactions ?? []).filter((tx) => tx.amount > 0));
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
      setIncomeTransactions(
        ((await fetchLedgerTransactions()) ?? []).filter((tx) => tx.amount > 0),
      );
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
      setIncomeTransactions(
        ((await fetchLedgerTransactions()) ?? []).filter((tx) => tx.amount > 0),
      );
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
