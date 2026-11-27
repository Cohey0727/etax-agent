/**
 * signedAmount.ts — 符号を取りうる金額欄（雑所得の赤字・元入金など）の読み取り。
 */

const fullWidthDigit = /[０-９]/g;
const minusSigns = /[－−‐]/g;

/**
 * 入力欄の文字列を金額にする。全角の数字・マイナスは半角として読み、
 * 先頭の「-」だけを符号として扱い、小数点以下は切り捨てる。
 * 数字が無い（空欄・「-」だけ）ときは 0。
 */
export function parseSignedAmount(input: string): number {
  const text = input
    .replace(fullWidthDigit, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(minusSigns, "-")
    .replace(/[．。]/g, ".")
    .trim();
  const negative = text.startsWith("-");
  const integerPart = text.split(".")[0] ?? "";
  const digits = integerPart.replace(/[^0-9]/g, "");
  if (digits === "") return 0;
  const value = Number(digits);
  if (!Number.isFinite(value) || value === 0) return 0;
  return negative ? -value : value;
}
