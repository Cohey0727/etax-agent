/**
 * authSession.ts — リクエストからセッション/APIキーを解決する共通処理（usecases）。
 *
 * Authorization: Bearer <token>（セッショントークン、または etax_ で始まる
 * API キー）と Cookie（etax_session）の両方を受ける。MCP クライアントは
 * API キーを Bearer で送る想定。
 */
import { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { Db } from "../lib/db";
import { isSecureDeployment } from "../lib/publicUrl";
import { createSession, resolveApiKeyUserId, resolveSessionUserId } from "../repositories/userRepository";

export const SESSION_COOKIE = "etax_session";

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

/** リクエストの資格情報からユーザーIDを解決する。無ければ undefined。 */
export async function resolveRequestUserId(
  db: Db,
  c: Context,
): Promise<number | undefined> {
  const authorization = c.req.header("Authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : undefined;
  const token = bearer ?? getCookie(c, SESSION_COOKIE);
  if (!token) return undefined;
  if (token.startsWith("etax_")) return resolveApiKeyUserId(db, token);
  return resolveSessionUserId(db, token);
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
