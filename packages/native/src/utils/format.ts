/** format.ts — 表示用の整形（金額・日付・数値入力のパース）。 */

/** 金額を「1,234 円」形式にする。 */
export function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")} 円`;
}

/** 数値を桁区切りだけの文字列にする。 */
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("ja-JP");
}

/**
 * 金額入力欄の文字列を整数の円に読む。全角の数字・マイナスは半角として扱い、
 * 小数点以下は切り捨てる。最初の数字より前の「-」だけを符号とし、桁区切りや
 * 「¥5,000-」の末尾の「-」のような、それ以外の記号は無視する。数字が無ければ 0。
 */
export function parseAmount(input: string): number {
  const text = input.normalize("NFKC").replace(/[\u2010-\u2015\u2212\u30fc]/g, "-");
  const integerPart = text.split(".")[0] ?? "";
  const firstDigit = integerPart.search(/[0-9]/);
  if (firstDigit < 0) return 0;
  const negative = integerPart.slice(0, firstDigit).includes("-");
  const value = Number(integerPart.slice(firstDigit).replace(/[^0-9]/g, ""));
  if (!Number.isFinite(value) || value === 0) return 0;
  return negative ? -value : value;
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
