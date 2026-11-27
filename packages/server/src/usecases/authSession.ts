/**
 * authSession.ts — リクエストからセッション/APIキーを解決する共通処理（usecases）。
 *
 * Authorization: Bearer <token>（セッショントークン、または etax_ で始まる
 * API キー）と Cookie（etax_session）の両方を受ける。MCP クライアントは
 * API キーを Bearer で送る想定。
 */
import { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { Db, getDb } from "../lib/db";
import { isSecureDeployment } from "../lib/publicUrl";
import { createSession, resolveApiKeyUserId, resolveSessionUserId } from "../repositories/userRepository";

export const SESSION_COOKIE = "etax_session";

/** 認証 API が使う DB。未設定なら 503。 */
export function requireAuthDb(): Db {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  return db;
}

/** セッションを発行し、httpOnly Cookie とレスポンス用トークンを返す。 */
export async function issueSession(c: Context, db: Db, userId: number): Promise<string> {
  const token = await createSession(db, userId);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
    // https 配備では Secure を付ける（平文 http へ Cookie を送らない）
    secure: isSecureDeployment(c),
  });
  return token;
}

/** リクエストの資格情報の種類。API キーは外部エージェント向けで、使える操作が狭い。 */
export type CredentialKind = "session" | "apiKey";

export interface RequestCredential {
  userId: number;
  kind: CredentialKind;
}

/** リクエストの資格情報からユーザーIDと資格情報の種類を解決する。無ければ undefined。 */
export async function resolveRequestCredential(
  db: Db,
  c: Context,
): Promise<RequestCredential | undefined> {
  const authorization = c.req.header("Authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : undefined;
  const token = bearer ?? getCookie(c, SESSION_COOKIE);
  if (!token) return undefined;
  const kind: CredentialKind = token.startsWith("etax_") ? "apiKey" : "session";
  const userId =
    kind === "apiKey" ? await resolveApiKeyUserId(db, token) : await resolveSessionUserId(db, token);
  return userId === undefined ? undefined : { userId, kind };
}

/**
 * セッション（画面からのログイン）でだけ許す操作か。API キーの発行・失効と
 * 2段階認証の設定は、漏れたキーで無期限のキーを作ったり 2FA を外したり
 * できないよう、API キーでは受け付けない。
 */
export function requiresSessionCredential(path: string): boolean {
  return (
    path === "/api/auth/api-keys" ||
    path.startsWith("/api/auth/api-keys/") ||
    path.startsWith("/api/auth/totp/")
  );
}

/** リクエストのセッショントークン（ログアウト用）。 */
export function requestSessionToken(c: Context): string | undefined {
  const authorization = c.req.header("Authorization");
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (!token.startsWith("etax_")) return token;
  }
  return getCookie(c, SESSION_COOKIE);
}
