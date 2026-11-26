/**
 * 貼り付けられたマジックリンクトークンを取り出す。
 * リンクの URL 全文が貼られた場合は magic= パラメータから抽出し、
 * それ以外はそのまま（前後の空白を除いて）トークンとして扱う。
 */
export function extractMagicToken(pasted: string): string {
  const text = pasted.trim();
  const match = /[?&]magic=([^&#\s]+)/.exec(text);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return text;
}
