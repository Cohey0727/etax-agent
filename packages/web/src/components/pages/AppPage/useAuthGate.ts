import { useCallback, useEffect, useRef, useState } from "react";
import { AuthConfig, AuthUser } from "@types";
import { AuthQuery, parseAuthQuery, setStorageUserId } from "@utils";
import { fetchAuthConfig, fetchMe, setUnauthorizedHandler } from "@utils/api";

/**
 * useAuthGate.ts — 認証ゲートの状態（AppPage 用フック）。
 *
 * 設定（必須かどうか）とログイン状態を確認する。メールリンク
 * （?magic=）や外部ログインの戻り（?auth_error=）のクエリは、URL同期
 * （パスだけの書き換え）で消える前に値ごと捕捉しておき、ログイン画面へ
 * 渡す。
 */
export function useAuthGate(onUserResolved: () => void) {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const authQueryRef = useRef<AuthQuery>(
    typeof window !== "undefined"
      ? parseAuthQuery(window.location.search)
      : { magic: null, authError: null, verify: null, totpChallenge: null },
  );
  const resolvedCallbackRef = useRef(onUserResolved);
  resolvedCallbackRef.current = onUserResolved;
  // API の 401 を受けたときに、ログイン中だったかと確認中かを読む（refreshAuth の中で書く）。
  const signedInRef = useRef(false);
  const refreshingRef = useRef(false);

  const refreshAuth = useCallback(async () => {
    refreshingRef.current = true;
    const [config, me] = await Promise.all([
      fetchAuthConfig().catch(() => null),
      fetchMe().catch(() => null),
    ]).finally(() => {
      refreshingRef.current = false;
    });
    signedInRef.current = me !== null;
    if (config) setAuthConfig(config);
    // 端末保存の名前空間をログイン中ユーザーに合わせる。
    // 画面の子コンポーネントが読み書きする前に、ここで同期的に設定する。
    setStorageUserId(me?.id ?? null);
    // 初期表示で読んだ会話履歴は名前空間が未確定だったため、確定後に読み直す
    resolvedCallbackRef.current();
    setAuthUser(me);
    setAuthChecked(true);
    if (me) {
      // ログインできたらクエリ（magic 等）を消して通常表示に戻す
      authQueryRef.current = { magic: null, authError: null, verify: null, totpChallenge: null };
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // ログイン中に API が 401 を返したら（セッション切れ・失効）、ログイン状態を確かめ直して
  // ログイン画面へ戻す。確認中に返る 401 では確かめ直さない（fetchMe 自身も 401 を返す）。
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!signedInRef.current || refreshingRef.current) return;
      void refreshAuth();
    });
    return () => setUnauthorizedHandler(null);
  }, [refreshAuth]);

  /** ログイン画面の表示が必要な状態か（未確認・必須モード未ログイン・認証クエリ処理待ち）。 */
  const authQueryPending =
    authQueryRef.current.magic !== null ||
    authQueryRef.current.authError !== null ||
    authQueryRef.current.verify !== null ||
    authQueryRef.current.totpChallenge !== null;
  const loginRequired = Boolean(
    authConfig && ((authConfig.required && !authUser) || (authQueryPending && !authUser)),
  );

  return { authConfig, authUser, authChecked, authQueryRef, refreshAuth, loginRequired };
}
