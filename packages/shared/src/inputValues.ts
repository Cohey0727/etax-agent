/**
 * inputValues.ts — 入力値（金額・人数・日付）の正規化。
 */

/** 数値入力を整数に正規化する（数値でない値・有限でない値は 0）。符号は残す。 */
export function toInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

/** 金額・人数の入力を非負の整数に正規化する（0 未満は 0）。 */
export function toNonNegativeInteger(value: unknown): number {
  return Math.max(toInteger(value), 0);
}

/** "YYYY-MM-DD" を UTC の Date にする。形式が違う・実在しない日付（2024-02-30 等）なら null。 */
export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}
