import {
  computeInvoiceTotals,
  InvoiceTaxRounding as SharedRounding,
} from "@etax/shared";
import {
  InvoiceInput,
  InvoiceLineInput,
  InvoiceRecord,
  InvoiceTaxRounding,
} from "@types";

/**
 * invoiceOptions.ts — 請求書画面の選択肢・表示名・変換ヘルパー。
 * 金額の計算はサーバーと同じ共有関数（@etax/shared）で行い、表示と保存でずらさない。
 */

export const TAX_RATE_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 10, label: "10%" },
  { value: 8, label: "8%（軽減）" },
  { value: 0, label: "対象外" },
];

export const ROUNDING_OPTIONS: readonly { value: InvoiceTaxRounding; label: string }[] = [
  { value: "floor", label: "切り捨て" },
  { value: "round", label: "四捨五入" },
  { value: "ceil", label: "切り上げ" },
];

export const ROUNDING_LABELS: Record<InvoiceTaxRounding, string> = {
  floor: "切り捨て",
  round: "四捨五入",
  ceil: "切り上げ",
};

export const STATUS_LABELS: Record<InvoiceRecord["status"], string> = {
  draft: "下書き",
  issued: "発行済み",
};

/** JST の今日（YYYY-MM-DD）。 */
export function todayInTokyo(): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const emptyLine = (): InvoiceLineInput => ({
  item_name: "",
  quantity: 1,
  unit: "",
  unit_price: 0,
  tax_rate_percent: 10,
  is_reduced_rate: false,
});

export const emptyDraft = (): InvoiceInput => ({
  issue_date: todayInTokyo(),
  due_date: null,
  counterparty_name: "",
  counterparty_address: "",
  is_qualified: true,
  tax_rounding: "floor",
  memo: "",
  lines: [emptyLine()],
});

export const toInput = (row: InvoiceRecord): InvoiceInput => ({
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

/** 入力中明細のプレビュー集計（サーバーと同じ計算）。 */
export function previewTotals(input: InvoiceInput) {
  return computeInvoiceTotals(
    input.lines.map((line) => ({
      itemName: line.item_name,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unit_price,
      taxRatePercent: line.tax_rate_percent,
      isReducedRate: line.is_reduced_rate,
    })),
    input.tax_rounding as SharedRounding,
  );
}

/** 数量の表示（整数はそのまま、小数は末尾ゼロを落とす）。 */
export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** 保存前の画面側チェック。発行時の厳密な検証はサーバー側で行う。 */
export function validateInput(input: InvoiceInput): string | null {
  if (!input.issue_date) return "発行日を入力してください";
  if (input.lines.length === 0) return "明細を1行以上入力してください";
  for (const line of input.lines) {
    if (!(line.quantity > 0)) return "数量は0より大きく入力してください";
    if (line.unit_price < 0) return "単価は0以上で入力してください";
  }
  return null;
}
