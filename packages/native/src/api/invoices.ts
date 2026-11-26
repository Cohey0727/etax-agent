/**
 * invoices.ts — 請求書（作成・発行・修正・消込・PDF）のAPI。
 */
import { apiJson, apiJsonOrNull } from "./client";
import {
  CreateInvoicePaymentInput,
  InvoiceInput,
  InvoicePaymentsResult,
  InvoiceRecord,
  InvoiceSearchFilters,
  ReconciliationCandidateRecord,
} from "./types";

/** 請求書の一覧を取得する（検索条件つき）。DB未接続の場合は null。 */
export async function fetchInvoices(
  filters: InvoiceSearchFilters = {},
): Promise<InvoiceRecord[] | null> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.min_total !== undefined) params.set("min_total", String(filters.min_total));
  if (filters.max_total !== undefined) params.set("max_total", String(filters.max_total));
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  const data = await apiJsonOrNull<{ invoices: InvoiceRecord[] }>(
    query ? `/api/invoices?${query}` : "/api/invoices",
  );
  return data?.invoices ?? null;
}

/** 請求書（下書き）を作成する。 */
export async function createInvoice(input: InvoiceInput): Promise<InvoiceRecord> {
  const data = await apiJson<{ invoice: InvoiceRecord | null }>("/api/invoices", {
    method: "POST",
    body: input,
  });
  if (!data.invoice) throw new Error("請求書の作成に失敗しました");
  return data.invoice;
}

/** 請求書（下書き）を更新する。発行済みはサーバー側で拒まれる。 */
export async function updateInvoice(id: number, input: InvoiceInput): Promise<InvoiceRecord> {
  const data = await apiJson<{ invoice: InvoiceRecord | null }>(`/api/invoices/${id}`, {
    method: "PUT",
    body: input,
  });
  if (!data.invoice) throw new Error("請求書の更新に失敗しました");
  return data.invoice;
}

/** 請求書（下書き）を削除する。 */
export async function deleteInvoice(id: number): Promise<void> {
  await apiJson(`/api/invoices/${id}`, { method: "DELETE" });
}

/** 請求書を発行する（採番され、以後は変更できない）。 */
export async function issueInvoice(id: number): Promise<InvoiceRecord> {
  const data = await apiJson<{ invoice: InvoiceRecord | null }>(`/api/invoices/${id}/issue`, {
    method: "POST",
  });
  if (!data.invoice) throw new Error("請求書の発行に失敗しました");
  return data.invoice;
}

/** 発行済み請求書の修正用下書きを作成する。 */
export async function createInvoiceCorrection(id: number): Promise<InvoiceRecord> {
  const data = await apiJson<{ invoice: InvoiceRecord | null }>(`/api/invoices/${id}/correct`, {
    method: "POST",
  });
  if (!data.invoice) throw new Error("修正用下書きの作成に失敗しました");
  return data.invoice;
}

/** 請求書の消込一覧とサマリを取得する。DB未接続の場合は null。 */
export async function fetchInvoicePayments(
  invoiceId: number,
): Promise<InvoicePaymentsResult | null> {
  return apiJsonOrNull<InvoicePaymentsResult>(`/api/invoices/${invoiceId}/payments`);
}

/** 請求書へ入金を消し込む（候補の承認もこの呼び出しで確定する）。 */
export async function createInvoicePayment(
  invoiceId: number,
  input: CreateInvoicePaymentInput,
): Promise<InvoicePaymentsResult> {
  return apiJson<InvoicePaymentsResult>(`/api/invoices/${invoiceId}/payments`, {
    method: "POST",
    body: input,
  });
}

/** 請求書の消込を解除する。 */
export async function deleteInvoicePayment(
  invoiceId: number,
  paymentId: number,
): Promise<InvoicePaymentsResult> {
  return apiJson<InvoicePaymentsResult>(`/api/invoices/${invoiceId}/payments/${paymentId}`, {
    method: "DELETE",
  });
}

/** 消込候補の自動推測を取得する。DB未接続の場合は null。 */
export async function fetchPaymentSuggestions(
  invoiceId: number,
): Promise<ReconciliationCandidateRecord[] | null> {
  const data = await apiJsonOrNull<{ candidates: ReconciliationCandidateRecord[] }>(
    `/api/invoices/${invoiceId}/payment-suggestions`,
  );
  return data?.candidates ?? null;
}

/** 発行済み請求書PDFの配信パス（認証付きで取得する）。 */
export function invoicePdfPath(invoice: InvoiceRecord): string {
  return `/api/invoices/${invoice.id}/pdf`;
}

/** 請求書PDFの保存ファイル名。 */
export function invoicePdfFilename(invoice: InvoiceRecord): string {
  return `請求書_${invoice.document_number ?? invoice.id}.pdf`;
}
