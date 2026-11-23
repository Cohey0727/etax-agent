/**
 * errors.ts — エラー文言と例外からのメッセージ抽出（lib）。
 *
 * API のエラーレスポンスは従来どおり `{ error: string }` 形式で統一する
 * （CODING_CONVENTIONS_BACKEND の ErrorSchema は `message` フィールドだが、
 * 既存クライアント互換のため本プロジェクトでは `error` を正とする）。
 */

/** DB を開けなかった時に DB 必須エンドポイントが返す文言。 */
export const databaseUnavailableMessage =
  "データフォルダ内のDB（SQLite）を開けないためDB機能は利用できません。ETAX_DATA_DIR の書き込み権限を確認してください。";

/** 未知の例外から表示用メッセージを取り出す。 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** DB接続失敗時の文言（503 で返す）。 */
export function databaseConnectionErrorMessage(e: unknown): string {
  return `データベースに接続できませんでした: ${errorMessage(e)}`;
}
