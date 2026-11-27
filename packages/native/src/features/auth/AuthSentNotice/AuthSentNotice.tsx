import { View } from "react-native";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { space } from "@/theme";

export interface AuthSentNoticeProps {
  variant: "magicSent" | "verifySent";
  onBack: () => void;
}

const NOTICES: Record<AuthSentNoticeProps["variant"], { title: string; body: string }> = {
  magicSent: {
    title: "リンクを送信しました",
    body: "メールに届いたリンクを開くとログインできます。リンクを開けない場合は「メールリンクでログイン」からトークンを貼り付けてください。",
  },
  verifySent: {
    title: "確認メールを送信しました",
    body: "メールに届いた確認リンクを開くと登録が完了します。確認が終わるまでログインはできません。",
  },
};

/** ログイン用リンク・登録の確認メールを送ったことの案内。 */
export function AuthSentNotice({ variant, onBack }: AuthSentNoticeProps) {
  const notice = NOTICES[variant];
  return (
    <View style={{ gap: space.sm }}>
      <AppText size="lg" weight="bold">
        {notice.title}
      </AppText>
      <AppText size="sm" tone="muted">
        {notice.body}
      </AppText>
      <AppButton label="ログインに戻る" variant="ghost" size="sm" onPress={onBack} />
    </View>
  );
}
