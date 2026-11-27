/**
 * errors.ts — エラー文言と例外の分類（lib）。
 *
 * API のエラーレスポンスは `{ error: string }` 形式（ErrorSchema）。
 * DB の例外は app.onError でここの分類に従ってステータスを決め、クライアントには
 * 固定の文言だけを返す（Drizzle の例外文には SQL 文とバインド値が入るため）。
 */
import { DrizzleQueryError } from "drizzle-orm/errors";
import { HTTPException } from "hono/http-exception";
import { DatabaseError } from "pg";
import { Db, getDb } from "./db";

/** DB を開けなかった時に DB 必須エンドポイントが返す文言。 */
export const databaseUnavailableMessage =
  "データベース（PostgreSQL）に接続できないためDB機能は利用できません。DATABASE_URL の設定を確認してください。";

/** DB の処理に失敗したときの文言（503）。原因はサーバーのログにだけ残す。 */
export const databaseFailureMessage =
  "データベースの処理に失敗しました。しばらくしてから再度お試しください。";

/** 入力値が DB の型・範囲・制約に合わなかったときの文言（400）。 */
export const databaseInputErrorMessage = "入力値が保存できる範囲・形式ではありません";

/** 未知の例外から表示用メッセージを取り出す。 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** DB 必須の処理で DB を取り出す。未設定・初期化できないときは 503 にする。 */
export function requireDb(): Db {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: databaseUnavailableMessage });
  return db;
}

/** pg ドライバが接続の失敗に付けるエラーコード（OS のソケットエラー）。 */
const connectionErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
]);

function errorCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null || !("code" in e)) return undefined;
  return typeof e.code === "string" ? e.code : undefined;
}

/**
 * DB 由来の例外を分類する。PostgreSQL が返した SQLSTATE のクラス 22（データ例外）と
 * 23（整合性制約違反）は入力値が原因なので "input"、それ以外の DB エラーと接続の
 * 失敗は "unavailable"、DB と関係の無い例外は null。
 */
export function databaseErrorKind(e: unknown): "input" | "unavailable" | null {
  const cause = e instanceof DrizzleQueryError ? e.cause : e;
  if (cause instanceof DatabaseError) {
    const code = cause.code ?? "";
    return code.startsWith("22") || code.startsWith("23") ? "input" : "unavailable";
  }
  const code = errorCode(cause);
  if (code !== undefined && connectionErrorCodes.has(code)) return "unavailable";
  return e instanceof DrizzleQueryError ? "unavailable" : null;
}
