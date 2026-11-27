/**
 * auth.ts — 認証・課金まわりのAPI。ログイン応答の token がセッションの実体で、
 * 呼び出し側（AuthContext）が session.ts へ保存する。
 */
import { ApiError, apiJson, apiJsonOrNull } from "./client";
import {
  AuthConfig,
  AuthUser,
  BillingPlan,
  CredentialText,
  LoginResponse,
} from "./types";

/** 認証の公開設定（必須かどうか・利用可能なログイン方法）。 */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  return apiJson<AuthConfig>("/api/auth/config", { anonymous: true });
}

/**
 * ログイン中のユーザー。未ログイン（401）なら null。
 * 通信できない・サーバーが失敗した場合は ApiError を投げる（未ログインと区別する）。
 */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const data = await apiJson<{ user: AuthUser }>("/api/auth/me");
    return data.user;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

/** メールアドレスとパスワードでログインする。 */
export async function loginAccount(
  email: string,
  password: CredentialText,
): Promise<LoginResponse> {
  return apiJson<LoginResponse>(
    "/api/auth/login",
    { method: "POST", body: { email, password }, anonymous: true },
  );
}

/** 新規登録。メール確認が必要な場合は verification_required が返る。 */
export async function registerAccount(
  email: string,
  password: CredentialText,
): Promise<LoginResponse> {
  return apiJson<LoginResponse>(
    "/api/auth/register",
    { method: "POST", body: { email, password }, anonymous: true },
  );
}

/** ログアウト（サーバー側のセッションも破棄する）。 */
export async function logoutAccount(): Promise<void> {
  await apiJsonOrNull("/api/auth/logout", { method: "POST" });
}

/** TOTP の2段階目（ログイン時のコード検証）。 */
export async function loginWithTotp(
  challenge: string,
  code: string,
): Promise<LoginResponse> {
  return apiJson<LoginResponse>(
    "/api/auth/login/totp",
    { method: "POST", body: { challenge, code }, anonymous: true },
  );
}

/** マジックリンクの送信を依頼する。 */
export async function requestMagicLink(email: string): Promise<void> {
  await apiJson("/api/auth/magic-link", {
    method: "POST",
    body: { email },
    anonymous: true,
  });
}

/** メールで受け取ったマジックリンクのトークンを消費してログインする。 */
export async function consumeMagicLink(token: string): Promise<LoginResponse> {
  return apiJson<LoginResponse>(
    "/api/auth/magic-link/consume",
    { method: "POST", body: { token }, anonymous: true },
  );
}

/** 登録時の確認メールのトークンを消費してメール確認とログインを行う。 */
export async function verifyEmailAccount(token: string): Promise<LoginResponse> {
  return apiJson<LoginResponse>(
    "/api/auth/verify-email",
    { method: "POST", body: { token }, anonymous: true },
  );
}

/** TOTP 設定の開始（秘密と otpauth URL を受け取る）。 */
export async function setupTotp(): Promise<{ otpauth_url: string; secret: string }> {
  return apiJson("/api/auth/totp/setup", { method: "POST", body: {} });
}

/** TOTP を有効化する（認証アプリのコードで確認）。 */
export async function enableTotp(code: string): Promise<void> {
  await apiJson("/api/auth/totp/enable", { method: "POST", body: { code } });
}

/** TOTP を無効化する（認証アプリのコードで確認）。 */
export async function disableTotp(code: string): Promise<void> {
  await apiJson("/api/auth/totp/disable", { method: "POST", body: { code } });
}

/** 課金の状態（未設定なら billing_enabled=false）。 */
export async function fetchBillingPlan(): Promise<BillingPlan> {
  return apiJson<BillingPlan>("/api/billing/plan");
}

/** Stripe Checkout の URL を作る。 */
export async function createBillingCheckout(input: {
  success_url: string;
  cancel_url: string;
}): Promise<{ url: string }> {
  return apiJson("/api/billing/checkout", { method: "POST", body: input });
}
