/**
 * invoiceForm.ts — 請求書画面の表示名、作成・編集入力の初期値と変換、
 * 保存前の検証、入力中の明細の集計。Web と native の請求書画面が共有する。
 *
 * 入力は API のワイヤ形式（snake_case）。金額の計算は computeInvoiceTotals
 * （サーバーと同じ計算）に任せ、表示と保存で金額をずらさない。
 */
import {
  computeInvoiceTotals,
  INVOICE_TAX_ROUNDINGS,
  InvoiceTaxRounding,
  InvoiceTotals,
} from "./invoice";
import { InvoicePaymentKind, InvoicePaymentStatus, ReconciliationReason } from "./reconciliation";

/** 作成・編集入力の明細1行。単価は税抜。 */
export interface InvoiceFormLine {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  tax_rate_percent: number;
  is_reduced_rate: boolean;
}

/** 請求書の作成・編集入力。 */
export interface InvoiceFormInput {
  issue_date: string;
  due_date: string | null;
  counterparty_name: string;
  counterparty_address: string;
  is_qualified: boolean;
  tax_rounding: InvoiceTaxRounding;
  memo: string;
  lines: InvoiceFormLine[];
}

/** 請求書の状態（下書き・発行済み）。 */
export type InvoiceDocumentStatus = "draft" | "issued";

export const INVOICE_TAX_RATE_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 10, label: "10%" },
  { value: 8, label: "8%（軽減）" },
  { value: 0, label: "対象外" },
];

export const INVOICE_TAX_ROUNDING_LABELS: Record<InvoiceTaxRounding, string> = {
  floor: "切り捨て",
  round: "四捨五入",
  ceil: "切り上げ",
};

export const INVOICE_TAX_ROUNDING_OPTIONS: readonly { value: InvoiceTaxRounding; label: string }[] =
  INVOICE_TAX_ROUNDINGS.map((value) => ({ value, label: INVOICE_TAX_ROUNDING_LABELS[value] }));

export const INVOICE_STATUS_LABELS: Record<InvoiceDocumentStatus, string> = {
  draft: "下書き",
  issued: "発行済み",
};

export const INVOICE_PAYMENT_STATUS_LABELS: Record<InvoicePaymentStatus, string> = {
  unpaid: "未消込",
  partial: "一部消込",
  paid: "消込済み",
};

export const INVOICE_PAYMENT_KIND_LABELS: Record<InvoicePaymentKind, string> = {
  payment: "入金充当",
  fee: "振込手数料",
  discount: "売上値引",
  overpayment: "預り金（過入金）",
};

export const RECONCILIATION_REASON_LABELS: Record<ReconciliationReason, string> = {
  amount_exact: "金額一致",
  amount_partial: "金額近似",
  name_match: "取引先名の一致",
  date_close: "期日が近い",
};

/** 日本時間の今日（YYYY-MM-DD）。 */
function todayInTokyo(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const emptyInvoiceLine = (): InvoiceFormLine => ({
  item_name: "",
  quantity: 1,
  unit: "",
  unit_price: 0,
  tax_rate_percent: 10,
  is_reduced_rate: false,
});

/** 新しい請求書の入力（発行日は日本時間の今日）。 */
export const emptyInvoiceInput = (): InvoiceFormInput => ({
  issue_date: todayInTokyo(),
  due_date: null,
  counterparty_name: "",
  counterparty_address: "",
  is_qualified: true,
  tax_rounding: "floor",
  memo: "",
  lines: [emptyInvoiceLine()],
});

/** 保存済みの請求書から編集入力を作る（入力に無い項目は落とす）。 */
export const invoiceRecordToInput = (row: InvoiceFormInput): InvoiceFormInput => ({
  issue_date: row.issue_date,
  due_date: row.due_date,
  counterparty_name: row.counterparty_name,
  counterparty_address: row.counterparty_address,
  is_qualified: row.is_qualified,
  tax_rounding: row.tax_rounding,
  memo: row.memo,
  lines: row.lines.map((line) => ({
    item_name: line.item_name,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unit_price,
    tax_rate_percent: line.tax_rate_percent,
    is_reduced_rate: line.is_reduced_rate,
  })),
});

/** 入力中の明細の集計（サーバーと同じ計算）。 */
export function invoiceInputTotals(input: InvoiceFormInput): InvoiceTotals {
  return computeInvoiceTotals(
    input.lines.map((line) => ({
      itemName: line.item_name,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unit_price,
      taxRatePercent: line.tax_rate_percent,
      isReducedRate: line.is_reduced_rate,
    })),
    input.tax_rounding,
  );
}

/** 数量の表示（整数はそのまま、小数は小数第3位までにして末尾のゼロを落とす）。 */
export function formatInvoiceQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** 保存前の画面側の検証。発行時の厳密な検証はサーバー側で行う。 */
export function validateInvoiceInput(input: InvoiceFormInput): string | null {
  if (!input.issue_date) return "発行日を入力してください";
  if (input.lines.length === 0) return "明細を1行以上入力してください";
  for (const line of input.lines) {
    if (!(line.quantity > 0)) return "数量は0より大きく入力してください";
    if (line.unit_price < 0) return "単価は0以上で入力してください";
  }
  return null;
}

/**
 * 詳細・編集に出す請求書。一覧にある同じ請求書（消込などで更新された最新の値）を
 * 優先し、検索条件で一覧から外れていれば、作成・発行・保存の応答として手元に
 * 持っている値を使う（作った請求書が画面から消えないようにする）。
 */
export function latestInvoiceRecord<T extends { id: number }>(
  invoices: readonly T[],
  held: T | null,
): T | null {
  if (held === null) return null;
  return invoices.find((invoice) => invoice.id === held.id) ?? held;
}
