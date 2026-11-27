/**
 * authOAuth.ts — Google / GitHub の OAuth ログイン（usecases）。
 * クライアントID/シークレットが環境変数に揃ったプロバイダだけ有効になる
 * （未設定なら開始時点で 503、画面側も設定 API を見てボタンを出さない）。
 * フロー: start がプロバイダへリダイレクトし、callback でコードを交換して
 * メールアドレスを引き、外部IDと結び付いたユーザーのセッションを発行する。
 * リダイレクト応答のため、この2つは通常の Hono ハンドラとして登録する。
 */
import { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { beginChallengeUse, burnChallenge, issueChallenge } from "../lib/loginChallenge";
import { isSecureDeployment, publicBaseUrl } from "../lib/publicUrl";
import { findOrCreateOAuthUser } from "../repositories/userRepository";
import { issueSession } from "./authSession";

/**
 * OAuth state を発行したブラウザに紐付ける Cookie。state は署名つきだが
 * それだけでは他人のブラウザで開始したフローを踏ませるログイン CSRF が
 * 成立するため、開始時に Cookie へ同じ値を置き、callback で一致を必須にする。
 */
const OAUTH_STATE_COOKIE = "etax_oauth_state";

/**
 * ネイティブアプリから開始したフローの戻り先。アプリはカスタムスキームで
 * 結果（セッショントークン / TOTP チャレンジ / エラー）を受け取る。戻り先は
 * この固定値と完全一致する場合だけ許可し、任意の URL は受け付けない
 * （オープンリダイレクト防止）。開始時に Cookie へ印を置き、callback で読む。
 */
const NATIVE_APP_RETURN_URL = "etaxagent://auth-callback";
const OAUTH_APP_RETURN_COOKIE = "etax_oauth_app_return";

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

/**
 * redirect_uri の組み立てには設定済みの公開オリジンだけを使う。
 * Host / Origin ヘッダは汚染され得るため使わない（Issue #6）。
 * 未設定なら安全な redirect_uri を作れないので null を返す。
 */
function redirectUri(provider: OAuthProvider): string | null {
  const base = publicBaseUrl();
  return base ? `${base}/api/auth/oauth/${provider}/callback` : null;
}

/** GET /api/auth/oauth/:provider/start — プロバイダの認可画面へリダイレクト。 */
export async function oauthStartHandler(c: Context): Promise<Response> {
  const provider = providerFromParam(c);
  if (!oauthConfigured(provider)) {
    throw new HTTPException(503, { message: "このログイン方法は設定されていません" });
  }
  const uri = redirectUri(provider);
  if (!uri) {
    throw new HTTPException(503, { message: "公開オリジン（ETAX_PUBLIC_URL）が設定されていません" });
  }
  const config = PROVIDERS[provider];
  const state = issueChallenge(0, `oauth:${provider}`, 10 * 60 * 1000);
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/api/auth/oauth",
    maxAge: 10 * 60,
    secure: isSecureDeployment(c),
  });
  // ネイティブアプリからの開始なら、結果の戻り先を Cookie に控える。
  if (c.req.query("native_return") === NATIVE_APP_RETURN_URL) {
    setCookie(c, OAUTH_APP_RETURN_COOKIE, "1", {
      httpOnly: true,
      sameSite: "Lax",
      path: "/api/auth/oauth",
      maxAge: 10 * 60,
      secure: isSecureDeployment(c),
    });
  }
  const params = new URLSearchParams({
    client_id: process.env[config.clientIdEnv] as string,
    redirect_uri: uri,
    response_type: "code",
    scope: config.scope,
    state,
  });
  return c.redirect(`${config.authorizeUrl}?${params.toString()}`);
}

async function exchangeCode(provider: OAuthProvider, code: string): Promise<string> {
  const config = PROVIDERS[provider];
  const uri = redirectUri(provider);
  if (!uri) throw new Error("公開オリジンが設定されていません");
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: process.env[config.clientIdEnv] as string,
      client_secret: process.env[config.clientSecretEnv] as string,
      code,
      redirect_uri: uri,
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
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
    const data = (await res.json()) as { sub?: string; email?: string; email_verified?: boolean };
    if (!data.sub || !data.email || data.email_verified !== true) {
      throw new Error("検証済みのメールアドレスが取得できませんでした");
    }
    return { providerUserId: data.sub, email: data.email.toLowerCase() };
  }
  const userRes = await fetch("https://api.github.com/user", { headers, signal: AbortSignal.timeout(15_000) });
  if (!userRes.ok) throw new Error(`github user failed: ${userRes.status}`);
  const user = (await userRes.json()) as { id?: number };
  if (!user.id) throw new Error("GitHub のユーザーIDが取得できませんでした");
  const emailsRes = await fetch("https://api.github.com/user/emails", { headers, signal: AbortSignal.timeout(15_000) });
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
  // state は開始したブラウザの Cookie と一致し、かつ単回使用であること
  // （ログイン CSRF と state 再利用の防止）。
  const stateCookie = getCookie(c, OAUTH_STATE_COOKIE);
  deleteCookie(c, OAUTH_STATE_COOKIE, { path: "/api/auth/oauth" });
  // ネイティブアプリからのフローなら、結果はアプリの戻り先へ返す。
  const appReturn = getCookie(c, OAUTH_APP_RETURN_COOKIE) === "1" ? NATIVE_APP_RETURN_URL : null;
  deleteCookie(c, OAUTH_APP_RETURN_COOKIE, { path: "/api/auth/oauth" });
  const finish = (params: Record<string, string>): Response => {
    const query = new URLSearchParams(params).toString();
    if (appReturn) return c.redirect(query ? `${appReturn}?${query}` : appReturn);
    return c.redirect(query ? `/?${query}` : "/");
  };
  if (
    !code ||
    !state ||
    stateCookie !== state ||
    beginChallengeUse(state, `oauth:${provider}`) === undefined
  ) {
    return finish({ auth_error: "oauth_state" });
  }
  burnChallenge(state, `oauth:${provider}`);
  try {
    const accessToken = await exchangeCode(provider, code);
    const profile = await fetchProfile(provider, accessToken);
    const user = await findOrCreateOAuthUser(db, provider, profile.providerUserId, profile.email);
    // TOTP 有効なユーザーは OAuth でも2段階目を必須にする（2FA 迂回防止）。
    // セッションは発行せず、チャレンジを画面へ渡してコード入力を求める。
    if (user.totpEnabled) {
      const challenge = issueChallenge(user.id, "totp-login");
      return finish({ totp_challenge: challenge });
    }
    const token = await issueSession(c, db, user.id);
    // アプリへはセッショントークンそのものを渡す（アプリは Bearer で使う）。
    return appReturn ? finish({ token }) : finish({});
  } catch {
    return finish({ auth_error: "oauth_failed" });
  }
}
