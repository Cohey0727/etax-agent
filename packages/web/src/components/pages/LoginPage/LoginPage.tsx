/**
 * LoginPage.tsx — ログイン画面（pages）。
 * メール＋パスワード（TOTP 2段階つき）、マジックリンク、Google / GitHub の
 * OAuth に対応する。利用できる方法は /api/auth/config の応答で出し分ける。
 * メール内のリンク（?magic=<token>）で開かれた場合はトークンを消費して
 * そのままログインする。ログインできたら onAuthenticated を呼ぶ。
 * 見た目は organisms/auth の部品に委ね、このファイルは状態と認証の配線だけを持つ。
 */
import { useEffect, useRef, useState } from "react";
import { Button, Col, Icon } from "@components/atoms";
import {
  AuthModeTabs,
  AuthSentNotice,
  LoginBrandPanel,
  LoginFormPanel,
  MagicLinkForm,
  OAuthButtons,
  OAuthProviderKey,
  PasswordAuthForm,
  TotpAuthForm,
} from "@components/organisms/auth";
import { AuthConfig, LoginMode } from "@types";
import {
  consumeMagicLink,
  loginAccount,
  loginWithTotp,
  registerAccount,
  requestMagicLink,
  verifyEmailAccount,
} from "@utils";
import styles from "./LoginPage.css";

export interface LoginPageProps {
  config: AuthConfig;
  onAuthenticated: () => void;
  /** 起動時に捕捉したメールリンクのトークン（URL同期で消える前に AppPage が保持した値）。 */
  magic?: string | null;
  /** 起動時に捕捉した外部ログイン失敗の戻り（?auth_error= の値）。 */
  authError?: string | null;
  /** 起動時に捕捉したメール確認トークン（?verify= の値）。 */
  verify?: string | null;
  /** 起動時に捕捉した OAuth 後の TOTP チャレンジ（?totp_challenge= の値）。 */
  totpChallenge?: string | null;
}

export const LoginPage = ({
  config,
  onAuthenticated,
  magic,
  authError,
  verify,
  totpChallenge,
}: LoginPageProps) => {
  const [mode, setMode] = useState<LoginMode>("login");
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consumedRef = useRef(false);

  // メールのリンクから開かれた場合: トークンを消費してログインする。
  // AppPage が起動時に捕捉した値を優先する（URLは同期でパスだけに
  // 書き換え済みのことがある）。捕捉が無い場合は現在地のクエリを読む。
  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const magicToken = magic ?? params.get("magic");
    const authErrorValue = authError ?? params.get("auth_error");
    const verifyToken = verify ?? params.get("verify");
    const challengeValue = totpChallenge ?? params.get("totp_challenge");
    if (authErrorValue) {
      setError("外部ログインに失敗しました。もう一度お試しください。");
      return;
    }
    // OAuth ログイン後に TOTP が必要な場合はコード入力へ進む
    if (challengeValue) {
      setChallenge(challengeValue);
      setMode("totp");
      return;
    }
    // ログイン結果を受ける共通処理（TOTP 有効ならコード入力へ）
    const acceptLogin = (result: { totp_required?: boolean; challenge?: string }) => {
      if (result.totp_required && result.challenge) {
        setChallenge(result.challenge);
        setMode("totp");
        return;
      }
      onAuthenticated();
    };
    if (verifyToken) {
      setBusy(true);
      verifyEmailAccount(verifyToken)
        .then(acceptLogin)
        .catch(() => {
          setError("確認リンクが無効か期限切れです。お手数ですが、もう一度登録してください。");
        })
        .finally(() => setBusy(false));
      return;
    }
    if (!magicToken) return;
    setBusy(true);
    consumeMagicLink(magicToken)
      .then(acceptLogin)
      .catch(() => {
        setError("ログインリンクが無効か期限切れです。新しいリンクを送ってください。");
        setMode("magic");
      })
      .finally(() => setBusy(false));
  }, [onAuthenticated, magic, authError, verify, totpChallenge]);

  const handlePasswordSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "register"
          ? await registerAccount(email, secret)
          : await loginAccount(email, secret);
      if (result.verification_required) {
        setMode("verifySent");
        return;
      }
      if (result.totp_required && result.challenge) {
        setChallenge(result.challenge);
        setMode("totp");
        return;
      }
      onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleTotpSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await loginWithTotp(challenge, code);
      onAuthenticated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "コードの確認に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleMagicSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestMagicLink(email);
      setMode("magicSent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleSwitchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
  };

  const handleOAuthSelect = (key: OAuthProviderKey) => {
    window.location.href = `/api/auth/oauth/${key}/start`;
  };

  const oauthProviders: readonly { key: "google" | "github"; label: string }[] = [
    ...(config.methods.google ? [{ key: "google" as const, label: "Google でログイン" }] : []),
    ...(config.methods.github ? [{ key: "github" as const, label: "GitHub でログイン" }] : []),
  ];

  return (
    <div className={styles.root}>
      <LoginBrandPanel />
      <LoginFormPanel mode={mode} error={error}>
        {mode === "login" || mode === "register" ? (
          <Col gap="md">
            <AuthModeTabs mode={mode} onChange={handleSwitchMode} />
            <PasswordAuthForm
              mode={mode}
              email={email}
              secret={secret}
              busy={busy}
              onEmailChange={setEmail}
              onSecretChange={setSecret}
              onSubmit={handlePasswordSubmit}
            />
            <OAuthButtons providers={oauthProviders} onSelect={handleOAuthSelect} />
            {config.methods.magic_link ? (
              <Button variant="ghost" size="sm" onClick={() => setMode("magic")}>
                <Icon name="mail" size={15} />
                メールリンクでログイン
              </Button>
            ) : null}
          </Col>
        ) : null}

        {mode === "totp" ? (
          <TotpAuthForm
            code={code}
            busy={busy}
            onCodeChange={setCode}
            onSubmit={handleTotpSubmit}
            onRestart={() => setMode("login")}
          />
        ) : null}

        {mode === "magic" ? (
          <MagicLinkForm
            email={email}
            busy={busy}
            onEmailChange={setEmail}
            onSubmit={handleMagicSubmit}
            onBack={() => setMode("login")}
          />
        ) : null}

        {mode === "magicSent" ? (
          <AuthSentNotice variant="magicSent" onBack={() => setMode("login")} />
        ) : null}

        {mode === "verifySent" ? (
          <AuthSentNotice variant="verifySent" onBack={() => setMode("login")} />
        ) : null}
      </LoginFormPanel>
    </div>
  );
};
