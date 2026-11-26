/** format.ts — 表示用の整形（金額・日付・数値入力のパース）。 */

/** 金額を「1,234 円」形式にする。 */
export function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")} 円`;
}

/** 数値を桁区切りだけの文字列にする。 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("ja-JP");
}

/** 金額入力欄の文字列から数値だけを取り出す。不正な入力は 0。 */
export function parseAmount(input: string): number {
  const digits = input.replace(/[^0-9-]/g, "");
  if (digits === "" || digits === "-") return 0;
  const value = Number(digits);
  return Number.isFinite(value) ? value : 0;
}

/** 人数などの整数入力を取り出す。空は null（未入力と 0 を区別する用途）。 */
export function parseOptionalNumber(input: string): number | null {
  const digits = input.replace(/[^0-9]/g, "");
  if (digits === "") return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

/** ISO 日時や日付文字列を表示用（YYYY/MM/DD）にする。 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}/${m}/${d}`;
}
