/**
 * invoiceOptions.ts — 請求書画面の native だけの選択肢と表示の色。
 * 表示名・入力の変換・検証・集計は @etax/shared（invoiceForm）が持つ。
 */
import { INVOICE_TAX_RATE_OPTIONS } from "@etax/shared";
import { InvoicePaymentStatus } from "@/api";

/** 税率の選択肢（選択欄が文字列の値を取るため、値を文字列にしたもの）。 */
export const TAX_RATE_OPTIONS: readonly { value: string; label: string }[] =
  INVOICE_TAX_RATE_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }));

export const PAYMENT_STATUS_TONES: Record<InvoicePaymentStatus, "negative" | "warn" | "positive"> = {
  unpaid: "negative",
  partial: "warn",
  paid: "positive",
};
