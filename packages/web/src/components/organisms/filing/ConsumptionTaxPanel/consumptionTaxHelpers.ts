import { ConsumptionReturn, Transaction, summarizeConsumptionTax } from "@etax/shared";
import { formatYen } from "@utils";

/**
 * consumptionTaxHelpers.ts — 消費税画面の計算補助と汎用ヘルパー。
 */

/** 消費税額の裏付け表記（課税標準額 × 税率の内訳）。 */
export function outputTaxBacking(preview: ConsumptionReturn): string {
  const parts: string[] = [];
  if (preview.base10 > 0) parts.push(`10%分 ${formatYen(preview.base10)} × 7.8%`);
  if (preview.base8 > 0) parts.push(`軽減8%分 ${formatYen(preview.base8)} × 6.24%`);
  return parts.length > 0 ? `課税標準額 ${parts.join(" ＋ ")}` : "課税標準額なし";
}

/**
 * 基準期間（2年前）の課税売上高（千円・税抜）を帳簿から出す。
 * 2年前の帳簿が無ければ 0（手入力で直す前提）。
 */
export function deriveBasePeriodSalesThousands(
  transactions: Transaction[],
  year: number,
): number {
  const base = summarizeConsumptionTax(transactions, year - 2);
  const excl10 = Math.floor((base.salesIncl10 * 100) / 110);
  const excl8 = Math.floor((base.salesIncl8 * 100) / 108);
  return Math.floor((excl10 + excl8) / 1000);
}

export function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

export function toAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
