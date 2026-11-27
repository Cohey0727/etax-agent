/**
 * AccountPanel.tsx — アカウントと課金（organisms/settings）。
 * ログイン中のユーザー表示、TOTP 2要素認証の設定/解除、ログアウトと、
 * 課金プラン（月額490円）の状態表示・Stripe Checkout への導線を持つ。
 * 認証が必須でないローカル運用では、未ログインとして案内だけを出す。
 * Stripe 未設定（billing_enabled=false）のときは「準備中」と表示する。
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, Input, Row, Text } from "@components/atoms";
import { AuthUser, BillingPlan } from "@types";
import {
  clearCurrentUserStorage,
  clearStoredAgentApiKey,
  createBillingCheckout,
  disableTotp,
  enableTotp,
  fetchBillingPlan,
  fetchMe,
  formatDate,
  logoutAccount,
  setStorageUserId,
  setupTotp,
} from "@utils";

type LoadState = "loading" | "anonymous" | "ready";

/** 課金の状態ごとの表示名と、契約中（申し込みのボタンを出さない）として扱うか。 */
const billingStatuses = {
  none: { label: "未契約", subscribed: false },
  active: { label: "契約中", subscribed: true },
  trialing: { label: "トライアル中", subscribed: true },
  past_due: { label: "支払い確認中", subscribed: false },
  canceled: { label: "解約済み", subscribed: false },
  incomplete: { label: "手続き未完了", subscribed: false },
  unpaid: { label: "未払い", subscribed: false },
} as const satisfies Record<string, { label: string; subscribed: boolean }>;

type BillingStatus = keyof typeof billingStatuses;

export const AccountPanel = () => {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [billing, setBilling] = useState<BillingPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // TOTP 設定フロー
  const [totpSetup, setTotpSetup] = useState<{ otpauth_url: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpDisableCode, setTotpDisableCode] = useState("");

  const reload = useCallback(async () => {
    const me = await fetchMe().catch(() => null);
    if (!me) {
      setLoadState("anonymous");
      setUser(null);
      return;
    }
    setUser(me);
    setLoadState("ready");
    const plan = await fetchBillingPlan().catch(() => null);
    setBilling(plan);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleLogout = async () => {
    await logoutAccount();
    // このユーザーの端末キャッシュを消してから再読み込みする
    // （別アカウントが同じブラウザで開いても前の値が残らない）
    clearCurrentUserStorage();
    clearStoredAgentApiKey();
    setStorageUserId(null);
    window.location.reload();
  };

  const handleTotpSetup = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setTotpSetup(await setupTotp());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "TOTP の設定開始に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleTotpEnable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await enableTotp(totpCode);
      setTotpSetup(null);
      setTotpCode("");
      setMessage("2要素認証を有効にしました");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "コードが違います");
    } finally {
      setBusy(false);
    }
  };

  const handleTotpDisable = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await disableTotp(totpDisableCode);
      setTotpDisableCode("");
      setMessage("2要素認証を無効にしました");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "コードが違います");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckout = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { url } = await createBillingCheckout();
      window.location.href = url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "決済画面を開けませんでした");
    } finally {
      setBusy(false);
    }
  };

  if (loadState === "loading") {
    return (
      <Card>
        <Text variant="caption">アカウント情報を読み込み中…</Text>
      </Card>
    );
  }

  if (loadState === "anonymous" || !user) {
    return (
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">アカウント</Text>
          <Text variant="caption">
            ローカル運用モードです（ログインなしで利用中）。公開運用ではメール＋パスワード、
            マジックリンク、Google / GitHub ログインと TOTP 2要素認証が使えます。
          </Text>
        </Col>
      </Card>
    );
  }

  // 課金の状態はサーバーが決済サービスの値をそのまま返すので、知っている値だけを状態として扱う。
  const status = billing && isBillingStatus(billing.status) ? billingStatuses[billing.status] : null;
  const billingLabel = billing ? (status?.label ?? billing.status) : "取得できませんでした";
  const subscribed = status?.subscribed ?? false;

  return (
    <Col gap="lg">
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">アカウント</Text>
          <Row gap="md">
            <Text variant="statLabel">メールアドレス</Text>
            <Text>{user.email}</Text>
          </Row>
          {message ? <Text variant="caption">{message}</Text> : null}

          <Col gap="sm">
            <Text variant="statLabel">2要素認証（Authenticator アプリ）</Text>
            {user.totp_enabled ? (
              <Row gap="sm">
                <Input
                  inputMode="numeric"
                  placeholder="6桁コード"
                  value={totpDisableCode}
                  onChange={(e) => setTotpDisableCode(e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTotpDisable}
                  disabled={busy || totpDisableCode.length < 6}
                  disabledReason={busy ? "処理中です" : "6桁のコードを入力してください"}
                >
                  無効にする
                </Button>
              </Row>
            ) : totpSetup ? (
              <Col gap="sm">
                <Text variant="caption">
                  Authenticator アプリで次のキーを登録してください（otpauth URL を読み取るか、
                  シークレットを手入力）。
                </Text>
                <Text variant="caption">{totpSetup.otpauth_url}</Text>
                <Text variant="caption">シークレット: {totpSetup.secret}</Text>
                <Row gap="sm">
                  <Input
                    inputMode="numeric"
                    placeholder="6桁コード"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleTotpEnable}
                    disabled={busy || totpCode.length < 6}
                    disabledReason={busy ? "処理中です" : "6桁のコードを入力してください"}
                  >
                    有効にする
                  </Button>
                </Row>
              </Col>
            ) : (
              <Row gap="sm">
                <Text variant="caption">未設定</Text>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTotpSetup}
                  disabled={busy}
                  disabledReason="処理中です"
                >
                  設定する
                </Button>
              </Row>
            )}
          </Col>

          <Row gap="sm">
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              ログアウト
            </Button>
          </Row>
        </Col>
      </Card>

      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">課金プラン</Text>
          <Text variant="caption">
            eTaxAgent は月額490円（税込）です。税務シーズンだけの利用もでき、月単位で解約できます。
          </Text>
          {!billing || !billing.billing_enabled ? (
            <Text variant="caption">課金は現在準備中です。</Text>
          ) : (
            <Col gap="sm">
              <Row gap="md">
                <Text variant="statLabel">現在のプラン</Text>
                <Text>{billingLabel}</Text>
              </Row>
              {billing.current_period_end ? (
                <Row gap="md">
                  <Text variant="statLabel">次回更新日</Text>
                  <Text>{formatDate(billing.current_period_end)}</Text>
                </Row>
              ) : null}
              {!subscribed ? (
                <Row gap="sm">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleCheckout}
                    disabled={busy}
                    disabledReason="処理中です"
                  >
                    月額490円で始める
                  </Button>
                </Row>
              ) : null}
            </Col>
          )}
        </Col>
      </Card>
    </Col>
  );
};

function isBillingStatus(value: string): value is BillingStatus {
  return Object.hasOwn(billingStatuses, value);
}
