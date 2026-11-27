import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import {
  ApiError,
  BillingPlan,
  createBillingCheckout,
  disableTotp,
  enableTotp,
  fetchBillingPlan,
  setupTotp,
} from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { Field } from "@/components/Field";
import { LabeledValue } from "@/components/LabeledValue";
import { SkeletonCard } from "@/components/Skeleton";
import { space } from "@/theme";
import { formatDate } from "@/utils";
import { copyText } from "../copyText";

type BusyKind = "totpSetup" | "totpEnable" | "totpDisable" | "checkout" | "signOut" | null;

const BILLING_STATUS_LABELS: Record<string, string> = {
  none: "未契約",
  active: "契約中",
  trialing: "トライアル中",
  past_due: "支払い確認中",
  canceled: "解約済み",
  incomplete: "手続き未完了",
  unpaid: "未払い",
};

interface TotpSetupState {
  secret: string;
  otpauthUrl: string;
}

/** アカウント（メール・2要素認証・課金プラン・サインアウト）。 */
export function AccountPanel() {
  const { user, signOut, refreshUser } = useAuth();
  const [billing, setBilling] = useState<BillingPlan | null>(null);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [totpSetupState, setTotpSetupState] = useState<TotpSetupState | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<BusyKind>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadBilling = useCallback(async () => {
    try {
      setBilling(await fetchBillingPlan());
    } catch {
      setBilling(null);
    } finally {
      setBillingLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const run = useCallback(
    async (kind: Exclude<BusyKind, null>, action: () => Promise<string>) => {
      setBusy(kind);
      setMessage(null);
      try {
        setMessage({ ok: true, text: await action() });
      } catch (e) {
        setMessage({ ok: false, text: e instanceof ApiError ? e.message : "操作に失敗しました" });
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const handleTotpSetup = () =>
    run("totpSetup", async () => {
      const res = await setupTotp();
      setTotpSetupState({ secret: res.secret, otpauthUrl: res.otpauth_url });
      return "認証アプリで下のURLまたはシークレットを登録し、コードを入力してください。";
    });

  const handleTotpEnable = () =>
    run("totpEnable", async () => {
      await enableTotp(code);
      setTotpSetupState(null);
      setCode("");
      await refreshUser();
      return "2要素認証を有効にしました。";
    });

  const handleTotpDisable = () =>
    run("totpDisable", async () => {
      await disableTotp(code);
      setCode("");
      await refreshUser();
      return "2要素認証を無効にしました。";
    });

  const handleCheckout = () =>
    run("checkout", async () => {
      const { url } = await createBillingCheckout({
        success_url: "etaxagent://settings",
        cancel_url: "etaxagent://settings",
      });
      await WebBrowser.openBrowserAsync(url);
      // 決済ページから戻ったら、申込の結果を課金状態へ反映する
      await loadBilling();
      return "決済ページを開きました。";
    });

  const handleSignOut = () =>
    run("signOut", async () => {
      await signOut();
      return "サインアウトしました。";
    });

  if (!user) {
    return (
      <Card>
        <AppText size="lg" weight="bold">
          アカウント
        </AppText>
        <AppText size="sm" tone="muted">
          アカウント情報の表示にはログインが必要です。
        </AppText>
      </Card>
    );
  }

  const totpEnabled = user.totp_enabled === true;

  return (
    <View style={{ gap: space.md }}>
      <Card>
        <AppText size="lg" weight="bold">
          アカウント
        </AppText>
        <LabeledValue label="メールアドレス" value={user.email} />
        <View style={{ gap: space.sm }}>
          <AppText size="sm" weight="semibold" tone="subtle">
            2要素認証（Authenticator アプリ）
          </AppText>
          <Chip
            label={totpEnabled ? "設定済み" : "未設定"}
            tone={totpEnabled ? "positive" : "muted"}
          />
          {totpSetupState ? (
            <>
              <AppText size="xs" tone="muted" selectable>
                {totpSetupState.otpauthUrl}
              </AppText>
              <AppText size="xs" tone="muted" selectable>
                シークレット: {totpSetupState.secret}
              </AppText>
              <AppButton
                label="シークレットをコピー"
                variant="ghost"
                size="sm"
                onPress={() => void copyText(totpSetupState.secret)}
              />
            </>
          ) : null}
          {totpEnabled || totpSetupState ? (
            <Field
              label="認証コード"
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={(text) => setCode(text.replace(/[^0-9]/g, ""))}
              value={code}
            />
          ) : null}
          {totpSetupState ? (
            <AppButton
              label="有効にする"
              size="sm"
              loading={busy === "totpEnable"}
              disabled={code.length !== 6}
              onPress={() => void handleTotpEnable()}
            />
          ) : totpEnabled ? (
            <AppButton
              label="無効にする"
              variant="danger"
              size="sm"
              loading={busy === "totpDisable"}
              disabled={code.length !== 6}
              onPress={() => void handleTotpDisable()}
            />
          ) : (
            <AppButton
              label="設定を開始"
              variant="ghost"
              size="sm"
              loading={busy === "totpSetup"}
              onPress={() => void handleTotpSetup()}
            />
          )}
        </View>
        {message ? (
          <AlertBox tone={message.ok ? "success" : "error"} message={message.text} />
        ) : null}
        <AppButton
          label="サインアウト"
          variant="ghost"
          size="sm"
          loading={busy === "signOut"}
          onPress={() => void handleSignOut()}
        />
      </Card>

      {!billingLoaded ? (
        <SkeletonCard />
      ) : (
        <Card>
          <AppText size="lg" weight="bold">
            課金プラン
          </AppText>
          <AppText size="sm" tone="muted">
            eTaxAgent は月額490円（税込）です。税務シーズンだけの利用もでき、月単位で解約できます。
          </AppText>
          {!billing || !billing.billing_enabled ? (
            <AppText size="sm" tone="muted">
              課金は現在準備中です。
            </AppText>
          ) : (
            <>
              <LabeledValue
                label="現在のプラン"
                value={BILLING_STATUS_LABELS[billing.status] ?? billing.status}
              />
              {billing.current_period_end ? (
                <LabeledValue label="次回更新日" value={formatDate(billing.current_period_end)} />
              ) : null}
              {billing.status === "active" || billing.status === "trialing" ? null : (
                <AppButton
                  label="月額490円で始める"
                  size="sm"
                  loading={busy === "checkout"}
                  onPress={() => void handleCheckout()}
                />
              )}
            </>
          )}
        </Card>
      )}
    </View>
  );
}
