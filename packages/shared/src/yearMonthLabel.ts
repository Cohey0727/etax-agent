/**
 * yearMonthLabel.ts — 年月（YYYY-MM）の表示名。資金繰りの月次表などで使う。
 */

/** YYYY-MM を「YYYY年M月」にする。 */
export function yearMonthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}
