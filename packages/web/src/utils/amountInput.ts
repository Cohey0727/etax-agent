/** 金額・人数の入力欄の文字列を整数へ寄せる（空・不正は 0、小数は切り捨て）。 */
export function toAmount(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
