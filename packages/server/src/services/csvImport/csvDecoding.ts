/**
 * csvDecoding.ts — CSVバイト列のデコード（services/csvImport）。
 *
 * UTF-8で厳密に試し、壊れるようなら Shift_JIS で読む
 * （日本の銀行CSVは Shift_JIS が多いため）。
 */

/**
 * Base64 で渡された CSV バイト列を文字列にする。Base64 として不正なら例外
 * （atob の InvalidCharacterError）を投げる。
 */
export function decodeCsvBase64(contentBase64: string): { text: string; encoding: string } {
  return decodeCsvBytes(Uint8Array.from(atob(contentBase64), (ch) => ch.charCodeAt(0)));
}

/** CSVバイト列を文字列にする。UTF-8で厳密デコードを試み、失敗したら Shift_JIS。 */
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(bytes), encoding: "shift_jis" };
  }
}
