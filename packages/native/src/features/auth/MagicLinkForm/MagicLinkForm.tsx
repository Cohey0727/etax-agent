import { View } from "react-native";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { Field } from "@/components/Field";
import { space } from "@/theme";

export interface MagicLinkFormProps {
  email: string;
  token: string;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onRequestSubmit: () => void;
  onConsumeSubmit: () => void;
  onBack: () => void;
}

/** マジックリンクの送信フォーム＋届いたリンクのトークン貼り付け欄。 */
export function MagicLinkForm({
  email,
  token,
  busy,
  onEmailChange,
  onTokenChange,
  onRequestSubmit,
  onConsumeSubmit,
  onBack,
}: MagicLinkFormProps) {
  return (
    <View style={{ gap: space.sm }}>
      <AppText size="lg" weight="bold">
        メールリンクでログイン
      </AppText>
      <AppText size="sm" tone="muted">
        メールアドレスへログイン用リンクを送ります。リンクを開けない場合は、リンクに含まれるトークンを下の欄に貼り付けてください。
      </AppText>
      <Field
        label="メールアドレス"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={onEmailChange}
        textContentType="emailAddress"
        value={email}
      />
      <AppButton
        label="リンクを送る"
        loading={busy}
        disabled={email.trim() === ""}
        onPress={onRequestSubmit}
      />
      <Field
        label="リンクのトークン"
        autoCapitalize="none"
        onChangeText={onTokenChange}
        value={token}
      />
      <AppButton
        label="トークンでログイン"
        variant="ghost"
        loading={busy}
        disabled={token.trim() === ""}
        onPress={onConsumeSubmit}
      />
      <AppButton label="戻る" variant="ghost" size="sm" onPress={onBack} />
    </View>
  );
}
