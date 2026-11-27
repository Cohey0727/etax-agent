/**
 * pdfText.ts — 帳簿・請求書 PDF の表で使う文字列の整形（services/pdf）。
 */
import { PDFFont } from "pdf-lib";

/**
 * 改行を空白に置き換えて1行にする。pdf-lib の drawText は改行で行を分けて
 * 下へ送るため、1行の欄に改行入りの文字列（CSV の引用符付きセルの摘要など）を
 * そのまま渡すと、下の行に重なって描かれる。
 */
export function toSingleLine(text: string): string {
  return text.replace(/[\r\n\f\v]+/g, " ");
}

/** 金額をカンマ区切りにする（負数は - を前置）。 */
export function formatAmount(value: number): string {
  const digits = Math.abs(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return value < 0 ? `-${digits}` : digits;
}

/** 1行にして、列幅に収まるよう末尾を … で詰める。 */
export function fitText(font: PDFFont, text: string, maxWidth: number, size: number): string {
  const line = toSingleLine(text);
  if (font.widthOfTextAtSize(line, size) <= maxWidth) return line;
  const ellipsis = "…";
  let trimmed = line;
  while (trimmed.length > 0 && font.widthOfTextAtSize(trimmed + ellipsis, size) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + ellipsis;
}
