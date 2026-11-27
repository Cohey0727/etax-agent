import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ApiError,
  consumeMagicLink,
  loginAccount,
  loginWithTotp,
  registerAccount,
  requestMagicLink,
  verifyEmailAccount,
} from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { Card } from "@/components/Card";
import { SkeletonCard } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import {
  AuthSentNotice,
  extractMagicToken,
  LoginBrandPanel,
  MagicLinkForm,
  OAuthButtons,
  OAuthOutcome,
  OAuthProviderKey,
  PasswordAuthForm,
  PasswordMode,
  TotpAuthForm,
} from "@/features/auth";
import { colors, space } from "@/theme";

type Mode = PasswordMode | "totp" | "magic" | "magicSent" | "verifySent";

const MODE_TABS = [
  { id: "login" as const, label: "ログイン" },
  { id: "register" as const, label: "新規登録" },
];

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    magic?: string;
    verify?: string;
    totp_challenge?: string;
    auth_error?: string;
  }>();
  const { ready, config, user, applyLoginResponse } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [magicToken, setMagicToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const consumedRef = useRef(false);

  // ログイン済みでこの画面に来たらホームへ戻す
  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  const goHome = () => router.replace("/");

  const acceptLogin = async (response: Parameters<typeof applyLoginResponse>[0]) => {
    const outcome = await applyLoginResponse(response);
    if (outcome.kind === "signedIn") {
      goHome();
    } else if (outcome.kind === "totp") {
      setChallenge(outcome.challenge);
      setMode("totp");
    } else {
      setMode("verifySent");
    }
  };

  // ディープリンクのパラメータ（メールリンク・確認リンク・OAuth戻り）を一度だけ処理する
  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    if (params.auth_error) {
      setError("外部ログインに失敗しました。もう一度お試しください。");
      return;
    }
    if (params.totp_challenge) {
      setChallenge(params.totp_challenge);
      setMode("totp");
      return;
    }
    if (params.verify) {
      setBusy(true);
      verifyEmailAccount(params.verify)
        .then((res) => acceptLogin(res))
        .catch(() => setError("確認リンクが無効か期限切れです。お手数ですが、もう一度登録してください。"))
        .finally(() => setBusy(false));
      return;
    }
    if (params.magic) {
      setBusy(true);
      consumeMagicLink(params.magic)
        .then((res) => acceptLogin(res))
        .catch(() => {
          setError("ログインリンクが無効か期限切れです。新しいリンクを送ってください。");
          setMode("magic");
        })
        .finally(() => setBusy(false));
    }
    // 初回マウント時のパラメータだけを対象にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePasswordSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "register"
          ? await registerAccount(email.trim(), password)
          : await loginAccount(email.trim(), password);
      await acceptLogin(result);
    } catch (e) {
      setError(errorMessage(e, "ログインに失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const handleTotpSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptLogin(await loginWithTotp(challenge, code));
    } catch (e) {
      setError(errorMessage(e, "コードの確認に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const handleMagicRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestMagicLink(email.trim());
      setMode("magicSent");
    } catch (e) {
      setError(errorMessage(e, "送信に失敗しました"));
    } finally {
      setBusy(false);
    }
  };

  const handleMagicConsume = async () => {
    setBusy(true);
    setError(null);
    try {
      // トークンそのものでも、メール内リンクの URL 全文でも受け付ける。
      await acceptLogin(await consumeMagicLink(extractMagicToken(magicToken)));
    } catch (e) {
      setError(errorMessage(e, "ログインリンクが無効か期限切れです"));
    } finally {
      setBusy(false);
    }
  };

  const handleOAuthOutcome = async (outcome: OAuthOutcome) => {
    switch (outcome.kind) {
      case "token":
        setBusy(true);
        setError(null);
        try {
          await acceptLogin({ token: outcome.token });
        } catch (e) {
          setError(errorMessage(e, "外部ログインに失敗しました"));
        } finally {
          setBusy(false);
        }
        return;
      case "totp":
        setChallenge(outcome.challenge);
        setMode("totp");
        return;
      case "error":
        setError(outcome.message);
        return;
      case "cancelled":
        return;
      default:
        return outcome satisfies never;
    }
  };

  const methods = config?.methods;
  const oauthProviders: OAuthProviderKey[] = [
    ...(methods?.google ? (["google"] as const) : []),
    ...(methods?.github ? (["github"] as const) : []),
  ];
  const isPasswordMode = mode === "login" || mode === "register";

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <LoginBrandPanel />
      <View style={styles.formArea}>
        {!ready || !methods ? (
          <SkeletonCard />
        ) : (
          <Card fadeEnter enterDelay={260}>
            <View style={{ gap: space.md }}>
              {error ? <AlertBox tone="error" message={error} /> : null}
              {isPasswordMode ? (
                <>
                  {methods.password ? (
                    <Tabs
                      items={MODE_TABS}
                      activeId={mode}
                      onChange={(id) => {
                        setMode(id);
                        setError(null);
                      }}
                    />
                  ) : null}
                  {methods.password ? (
                    <PasswordAuthForm
                      mode={mode}
                      email={email}
                      password={password}
                      busy={busy}
                      onEmailChange={setEmail}
                      onPasswordChange={setPassword}
                      onSubmit={() => void handlePasswordSubmit()}
                    />
                  ) : null}
                  <OAuthButtons
                    providers={oauthProviders}
                    busy={busy}
                    onOutcome={(outcome) => void handleOAuthOutcome(outcome)}
                    onError={setError}
                  />
                  {methods.magic_link ? (
                    <AppButton
                      label="メールリンクでログイン"
                      variant="ghost"
                      size="sm"
                      onPress={() => setMode("magic")}
                    />
                  ) : null}
                </>
              ) : null}
              {mode === "totp" ? (
                <TotpAuthForm
                  code={code}
                  busy={busy}
                  onCodeChange={setCode}
                  onSubmit={() => void handleTotpSubmit()}
                  onRestart={() => setMode("login")}
                />
              ) : null}
              {mode === "magic" ? (
                <MagicLinkForm
                  email={email}
                  token={magicToken}
                  busy={busy}
                  onEmailChange={setEmail}
                  onTokenChange={setMagicToken}
                  onRequestSubmit={() => void handleMagicRequest()}
                  onConsumeSubmit={() => void handleMagicConsume()}
                  onBack={() => setMode("login")}
                />
              ) : null}
              {mode === "magicSent" ? (
                <AuthSentNotice variant="magicSent" onBack={() => setMode("magic")} />
              ) : null}
              {mode === "verifySent" ? (
                <AuthSentNotice variant="verifySent" onBack={() => setMode("login")} />
              ) : null}
            </View>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { paddingBottom: space.xl },
  formArea: { padding: space.md },
});
