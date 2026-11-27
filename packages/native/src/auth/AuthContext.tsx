/**
 * AuthContext.tsx — 認証状態（公開設定・ログインユーザー）の保持と、
 * ログイン応答の適用・ログアウトの共通処理。
 */
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ApiError,
  AuthConfig,
  AuthUser,
  LoginResponse,
  clearSessionToken,
  fetchMe,
  logoutAccount,
  saveSessionToken,
} from "@/api";
import { clearAgentConnection } from "@/features/settings/agentConnectionStorage";
import { bootstrapAuth } from "./bootstrapAuth";

export type LoginOutcome =
  | { kind: "signedIn"; user: AuthUser }
  | { kind: "totp"; challenge: string }
  | { kind: "verificationRequired" };

export interface AuthContextValue {
  /** 起動時の確認（設定・セッション）が終わったか。 */
  ready: boolean;
  /** 起動時の確認に失敗した理由（通信できない・サーバーの失敗）。成功していれば null。 */
  loadError: string | null;
  /** 起動時の確認をやり直す。 */
  reloadAuth: () => Promise<void>;
  config: AuthConfig | null;
  user: AuthUser | null;
  /** ログイン必須の構成か。 */
  loginRequired: boolean;
  /** ログイン応答を適用する。TOTP 要求・メール確認待ちも判別して返す。 */
  applyLoginResponse: (response: LoginResponse) => Promise<LoginOutcome>;
  /** セッションを破棄して未ログイン状態にする。 */
  signOut: () => Promise<void>;
  /** ユーザー情報を読み直す（TOTP 有効化などの反映用）。 */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const reloadAuth = useCallback(async () => {
    try {
      const result = await bootstrapAuth();
      setConfig(result.config);
      setUser(result.user);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "ネットワークに接続できませんでした");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reloadAuth();
  }, [reloadAuth]);

  const applyLoginResponse = useCallback(
    async (response: LoginResponse): Promise<LoginOutcome> => {
      if (response.totp_required && response.challenge) {
        return { kind: "totp", challenge: response.challenge };
      }
      if (response.verification_required) {
        return { kind: "verificationRequired" };
      }
      if (response.token) {
        await saveSessionToken(response.token);
      }
      const me = response.user ?? (await fetchMe());
      if (me) setUser(me);
      if (me) return { kind: "signedIn", user: me };
      return { kind: "verificationRequired" };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await logoutAccount().catch(() => undefined);
    await clearSessionToken();
    await clearAgentConnection(user?.id ?? null);
    setUser(null);
  }, [user?.id]);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe().catch(() => null);
    if (me) setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      loadError,
      reloadAuth,
      config,
      user,
      loginRequired: config?.required === true,
      applyLoginResponse,
      signOut,
      refreshUser,
    }),
    [ready, loadError, reloadAuth, config, user, applyLoginResponse, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth は AuthProvider の中で使ってください");
  return ctx;
}
