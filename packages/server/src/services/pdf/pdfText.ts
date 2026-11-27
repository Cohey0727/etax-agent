/**
 * pdfText.ts — 帳簿・請求書 PDF の表で使う文字列の整形（services/pdf）。
 */

/**
 * 改行を空白に置き換えて1行にする。pdf-lib の drawText は改行で行を分けて
 * 下へ送るため、1行の欄に改行入りの文字列（CSV の引用符付きセルの摘要など）を
 * そのまま渡すと、下の行に重なって描かれる。
 */
export function toSingleLine(text: string): string {
  return text.replace(/[\r\n\f\v]+/g, " ");
}
