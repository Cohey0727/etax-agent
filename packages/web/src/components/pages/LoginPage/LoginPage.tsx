/**
 * LoginPage.tsx — ログイン画面（pages）。
 * メール＋パスワード（TOTP 2段階つき）、マジックリンク、Google / GitHub の
 * OAuth に対応する。利用できる方法は /api/auth/config の応答で出し分ける。
 * メール内のリンク（?magic=<token>）で開かれた場合はトークンを消費して
 * そのままログインする。ログインできたら onAuthenticated を呼ぶ。
 */
import { useEffect, useRef, useState } from "react";
import { Button, Card, Col, Input, Text } from "@components/atoms";
import { AuthConfig } from "@types";
import { consumeMagicLink, loginAccount, loginWithTotp, registerAccount, requestMagicLink } from "@utils";
import styles from "./LoginPage.css";

type Mode = "login" | "register" | "totp" | "magic" | "magicSent";

export interface LoginPageProps {
  config: AuthConfig;
  onAuthenticated: () => void;
  /** 起動時に捕捉したメールリンクのトークン（URL同期で消える前に AppPage が保持した値）。 */
  magic?: string | null;
  /** 起動時に捕捉した外部ログイン失敗の戻り（?auth_error= の値）。 */
  authError?: string | null;
}

export const LoginPage = ({ config, onAuthenticated, magic, authError }: LoginPageProps) => {
  const [mode, setMode] = useState<Mode>("login");
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
    if (authErrorValue) {
      setError("外部ログインに失敗しました。もう一度お試しください。");
      return;
    }
    if (!magicToken) return;
    setBusy(true);
    consumeMagicLink(magicToken)
      .then(() => onAuthenticated())
      .catch(() => {
        setError("ログインリンクが無効か期限切れです。新しいリンクを送ってください。");
        setMode("magic");
      })
      .finally(() => setBusy(false));
  }, [onAuthenticated, magic, authError]);

  const handlePasswordSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "register"
          ? await registerAccount(email, secret)
          : await loginAccount(email, secret);
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

  const oauthProviders: readonly { key: "google" | "github"; label: string }[] = [
    ...(config.methods.google ? [{ key: "google" as const, label: "Google でログイン" }] : []),
    ...(config.methods.github ? [{ key: "github" as const, label: "GitHub でログイン" }] : []),
  ];

  return (
    <div className={styles.root}>
      <Card>
        <Col gap="md">
          <Col gap="sm">
            <Text variant="title">eTaxAgent</Text>
            <Text variant="caption">
              {mode === "register" ? "アカウントを作成してください" : "ログインしてください"}
            </Text>
          </Col>

          {error ? (
            <Text variant="caption" className={styles.error}>
              {error}
            </Text>
          ) : null}

          {mode === "login" || mode === "register" ? (
            <Col gap="sm">
              <Input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Input
                type="password"
                placeholder={mode === "register" ? "パスワード（8文字以上）" : "パスワード"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
              <Button variant="primary" onClick={handlePasswordSubmit} disabled={busy || !email || !secret}>
                {busy ? "処理中…" : mode === "register" ? "登録する" : "ログイン"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode(mode === "register" ? "login" : "register");
                  setError(null);
                }}
              >
                {mode === "register" ? "ログインはこちら" : "新規登録はこちら"}
              </Button>
              {config.methods.magic_link ? (
                <Button variant="ghost" size="sm" onClick={() => setMode("magic")}>
                  メールリンクでログイン
                </Button>
              ) : null}
              {oauthProviders.map((provider) => (
                <Button
                  key={provider.key}
                  variant="ghost"
                  onClick={() => {
                    window.location.href = `/api/auth/oauth/${provider.key}/start`;
                  }}
                >
                  {provider.label}
                </Button>
              ))}
            </Col>
          ) : null}

          {mode === "totp" ? (
            <Col gap="sm">
              <Text variant="caption">
                Authenticator アプリに表示される6桁のコードを入力してください。
              </Text>
              <Input
                inputMode="numeric"
                placeholder="6桁コード"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
              />
              <Button variant="primary" onClick={handleTotpSubmit} disabled={busy || code.length < 6}>
                {busy ? "確認中…" : "確認してログイン"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode("login")}>
                最初からやり直す
              </Button>
            </Col>
          ) : null}

          {mode === "magic" ? (
            <Col gap="sm">
              <Input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <Button variant="primary" onClick={handleMagicSubmit} disabled={busy || !email}>
                {busy ? "送信中…" : "ログインリンクを送る"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMode("login")}>
                パスワードでログイン
              </Button>
            </Col>
          ) : null}

          {mode === "magicSent" ? (
            <Col gap="sm">
              <Text variant="caption">
                ログインリンクをメールで送りました。メール内のリンクを開いてください（15分間有効）。
              </Text>
              <Button variant="ghost" size="sm" onClick={() => setMode("login")}>
                ログイン画面に戻る
              </Button>
            </Col>
          ) : null}
        </Col>
      </Card>
    </div>
  );
};
