import { View } from "react-native";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { Field } from "@/components/Field";
import { space } from "@/theme";

export interface TotpAuthFormProps {
  code: string;
  busy: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: () => void;
  onRestart: () => void;
}

/** TOTP（認証アプリの6桁コード）の入力フォーム。 */
export function TotpAuthForm({ code, busy, onCodeChange, onSubmit, onRestart }: TotpAuthFormProps) {
  return (
    <View style={{ gap: space.sm }}>
      <AppText size="lg" weight="bold">
        2段階認証
      </AppText>
      <AppText size="sm" tone="muted">
        認証アプリに表示される6桁のコードを入力してください。
      </AppText>
      <Field
        label="認証コード"
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={(text) => onCodeChange(text.replace(/[^0-9]/g, ""))}
        value={code}
      />
      <AppButton label="確認する" loading={busy} disabled={code.length !== 6} onPress={onSubmit} />
      <AppButton label="最初からやり直す" variant="ghost" size="sm" onPress={onRestart} />
    </View>
  );
}
