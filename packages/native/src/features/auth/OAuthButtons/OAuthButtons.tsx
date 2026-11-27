import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";
import { ApiError } from "@/api";
import { API_URL } from "@/config";
import { AppButton } from "@/components/AppButton";
import { space } from "@/theme";

export type OAuthProviderKey = "google" | "github";

export type OAuthOutcome =
  /** 外部ログインに成功し、セッショントークンを受け取った（ログインへの適用は呼び出し側）。 */
  | { kind: "token"; token: string }
  | { kind: "totp"; challenge: string }
  | { kind: "error"; message: string }
  | { kind: "cancelled" };

const PROVIDER_LABELS: Record<OAuthProviderKey, string> = {
  google: "Google でログイン",
  github: "GitHub でログイン",
};

export const NATIVE_AUTH_CALLBACK = "etaxagent://auth-callback";

/** OAuth の開始 URL（サーバーがネイティブ戻り先へ結果を返す）。 */
export function oauthStartUrl(provider: OAuthProviderKey): string {
  return `${API_URL}/api/auth/oauth/${provider}/start?native_return=${encodeURIComponent(NATIVE_AUTH_CALLBACK)}`;
}

function queryOf(url: string): URLSearchParams {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : "");
}

/** ブラウザで OAuth を開始し、戻り URL のクエリから結果を解釈する。 */
export async function runOAuth(provider: OAuthProviderKey): Promise<OAuthOutcome> {
  const result = await WebBrowser.openAuthSessionAsync(oauthStartUrl(provider), NATIVE_AUTH_CALLBACK);
  if (result.type !== "success") return { kind: "cancelled" };
  const params = queryOf(result.url);
  const authError = params.get("auth_error");
  if (authError) {
    return { kind: "error", message: "外部ログインに失敗しました。もう一度お試しください。" };
  }
  const challenge = params.get("totp_challenge");
  if (challenge) return { kind: "totp", challenge };
  const token = params.get("token");
  if (token) return { kind: "token", token };
  return { kind: "error", message: "外部ログインの結果を受け取れませんでした。" };
}

export interface OAuthButtonsProps {
  providers: readonly OAuthProviderKey[];
  busy: boolean;
  onOutcome: (outcome: OAuthOutcome) => void;
  onError: (message: string) => void;
}

/** Google / GitHub の OAuth ボタン群。 */
export function OAuthButtons({ providers, busy, onOutcome, onError }: OAuthButtonsProps) {
  if (providers.length === 0) return null;
  const handlePress = async (provider: OAuthProviderKey) => {
    try {
      onOutcome(await runOAuth(provider));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "外部ログインに失敗しました");
    }
  };
  return (
    <View style={{ gap: space.sm }}>
      {providers.map((provider) => (
        <AppButton
          key={provider}
          label={PROVIDER_LABELS[provider]}
          variant="ghost"
          disabled={busy}
          onPress={() => void handlePress(provider)}
        />
      ))}
    </View>
  );
}
