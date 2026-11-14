/**
 * errors.ts — エラー文言と例外からのメッセージ抽出（lib）。
 *
 * API のエラーレスポンスは従来どおり `{ error: string }` 形式で統一する
 * （CODING_CONVENTIONS_BACKEND の ErrorSchema は `message` フィールドだが、
 * 既存クライアント互換のため本プロジェクトでは `error` を正とする）。
 */

/** DATABASE_URL 未設定時に DB 必須エンドポイントが返す文言。 */
export const databaseUnavailableMessage =
  "DATABASE_URL が未設定のためDB機能は利用できません。docker compose up -d db で Postgres を起動し、DATABASE_URL を設定してください。";

/** 未知の例外から表示用メッセージを取り出す。 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** DB接続失敗時の文言（503 で返す）。 */
export function databaseConnectionErrorMessage(e: unknown): string {
  return `データベースに接続できませんでした: ${errorMessage(e)}`;
}
