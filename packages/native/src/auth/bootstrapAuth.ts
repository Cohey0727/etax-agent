/**
 * bootstrapAuth.ts — 起動時の認証状態の確認（公開設定と保存済みセッション）。
 */
import { fetchAuthConfig, fetchMe } from "../api/auth";
import { clearSessionToken, loadSessionToken } from "../api/session";
import { AuthConfig, AuthUser } from "../api/types";

export interface AuthBootstrap {
  config: AuthConfig;
  user: AuthUser | null;
}

/**
 * 公開設定と保存済みセッションを確かめる。保存済みトークンを消すのは
 * サーバーが失効（401）と答えたときだけ。通信できない・サーバーが失敗した
 * ときは ApiError を投げ、トークンは残す（通信が戻ればそのまま使える）。
 */
export async function bootstrapAuth(): Promise<AuthBootstrap> {
  const token = await loadSessionToken();
  const config = await fetchAuthConfig();
  if (!token) return { config, user: null };
  const user = await fetchMe();
  if (!user) await clearSessionToken();
  return { config, user };
}
