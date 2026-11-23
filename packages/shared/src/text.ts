/**
 * text.ts — 文字列の正規化（shared）。
 *
 * 検索・照合の前に通すことで、表記の揺れを吸収する:
 * - 全角英数・記号 → 半角（例: ＣａＳｙ → casy、２０２６ → 2026）
 * - 半角カタカナ → 全角カタカナ（例: ｶﾀﾘｽ → カタリス）
 * - 英字の大文字 → 小文字
 * 銀行明細は半角カタカナ・全角英数が混在するため、利用者がどちらの
 * 形式で入力しても同じ取引に当たるようにするための正本。
 */
export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}
