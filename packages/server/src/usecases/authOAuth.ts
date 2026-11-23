/**
 * authOAuth.ts — Google / GitHub の OAuth ログイン（usecases）。
 * クライアントID/シークレットが環境変数に揃ったプロバイダだけ有効になる
 * （未設定なら開始時点で 503、画面側も設定 API を見てボタンを出さない）。
 * フロー: start がプロバイダへリダイレクトし、callback でコードを交換して
 * メールアドレスを引き、外部IDと結び付いたユーザーのセッションを発行する。
 * リダイレクト応答のため、この2つは通常の Hono ハンドラとして登録する。
 */
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { issueChallenge, verifyChallenge } from "../lib/loginChallenge";
import { findOrCreateOAuthUser } from "../repositories/userRepository";
import { issueSession } from "./authSession";

export type OAuthProvider = "google" | "github";

interface ProviderConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
}

const PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  google: {
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
  },
  github: {
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
  },
};

export function oauthConfigured(provider: OAuthProvider): boolean {
  const config = PROVIDERS[provider];
  return Boolean(process.env[config.clientIdEnv] && process.env[config.clientSecretEnv]);
}

function providerFromParam(c: Context): OAuthProvider {
  const provider = c.req.param("provider");
  if (provider === "google" || provider === "github") return provider;
  throw new HTTPException(404, { message: "不明なプロバイダです" });
}

function publicBase(c: Context): string {
  return process.env.ETAX_PUBLIC_URL || c.req.header("Origin") || new URL(c.req.url).origin;
}

function redirectUri(c: Context, provider: OAuthProvider): string {
  return `${publicBase(c)}/api/auth/oauth/${provider}/callback`;
}

/** GET /api/auth/oauth/:provider/start — プロバイダの認可画面へリダイレクト。 */
export async function oauthStartHandler(c: Context): Promise<Response> {
  const provider = providerFromParam(c);
  if (!oauthConfigured(provider)) {
    throw new HTTPException(503, { message: "このログイン方法は設定されていません" });
  }
  const config = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: process.env[config.clientIdEnv] as string,
    redirect_uri: redirectUri(c, provider),
    response_type: "code",
    scope: config.scope,
    state: issueChallenge(0, `oauth:${provider}`, 10 * 60 * 1000),
  });
  return c.redirect(`${config.authorizeUrl}?${params.toString()}`);
}

async function exchangeCode(
  c: Context,
  provider: OAuthProvider,
  code: string,
): Promise<string> {
  const config = PROVIDERS[provider];
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: process.env[config.clientIdEnv] as string,
      client_secret: process.env[config.clientSecretEnv] as string,
      code,
      redirect_uri: redirectUri(c, provider),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("access_token が返りませんでした");
  return data.access_token;
}

async function fetchProfile(
  provider: OAuthProvider,
  accessToken: string,
): Promise<{ providerUserId: string; email: string }> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  if (provider === "google") {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers });
    if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
    const data = (await res.json()) as { sub?: string; email?: string; email_verified?: boolean };
    if (!data.sub || !data.email || data.email_verified !== true) {
      throw new Error("検証済みのメールアドレスが取得できませんでした");
    }
    return { providerUserId: data.sub, email: data.email.toLowerCase() };
  }
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new Error(`github user failed: ${userRes.status}`);
  const user = (await userRes.json()) as { id?: number };
  if (!user.id) throw new Error("GitHub のユーザーIDが取得できませんでした");
  const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
  if (!emailsRes.ok) throw new Error(`github emails failed: ${emailsRes.status}`);
  const emails = (await emailsRes.json()) as {
    email: string;
    primary: boolean;
    verified: boolean;
  }[];
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
  if (!primary) throw new Error("検証済みのメールアドレスが取得できませんでした");
  return { providerUserId: String(user.id), email: primary.email.toLowerCase() };
}

/** GET /api/auth/oauth/:provider/callback — コード交換とセッション発行。 */
export async function oauthCallbackHandler(c: Context): Promise<Response> {
  const provider = providerFromParam(c);
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  const code = c.req.query("code") ?? "";
  const state = c.req.query("state") ?? "";
  if (!code || verifyChallenge(state, `oauth:${provider}`) === undefined) {
    return c.redirect("/?auth_error=oauth_state");
  }
  try {
    const accessToken = await exchangeCode(c, provider, code);
    const profile = await fetchProfile(provider, accessToken);
    const user = await findOrCreateOAuthUser(db, provider, profile.providerUserId, profile.email);
    await issueSession(c, db, user.id);
    return c.redirect("/");
  } catch {
    return c.redirect("/?auth_error=oauth_failed");
  }
}
