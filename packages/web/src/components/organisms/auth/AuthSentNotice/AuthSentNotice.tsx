import { Button, Col, Icon, IconName, Text } from "@components/atoms";
import { LoginMode } from "@types";
import styles from "./AuthSentNotice.css";

export type AuthSentVariant = Extract<LoginMode, "magicSent" | "verifySent">;

export interface AuthSentNoticeProps {
  variant: AuthSentVariant;
  onBack: () => void;
}

// 送信完了の文案。列挙分岐はこのマッピング表に寄せる。
const NOTICE_COPY: Record<AuthSentVariant, { icon: IconName; message: string }> = {
  magicSent: {
    icon: "mail",
    message: "ログインリンクをメールで送りました。メール内のリンクを開いてください（15分間有効）。",
  },
  verifySent: {
    icon: "send",
    message: "確認メールを送りました。メール内のリンクを開くと登録が完了します（24時間有効）。",
  },
};

/**
 * AuthSentNotice — メール送信完了の表示（organisms/auth）。
 * 弾むアイコンと文案で「あとはメールを開くだけ」を伝える。
 */
export const AuthSentNotice = ({ variant, onBack }: AuthSentNoticeProps) => {
  const copy = NOTICE_COPY[variant];
  return (
    <Col gap="md" align="center">
      <span className={styles.iconCircle}>
        <Icon name={copy.icon} size={26} />
      </span>
      <Text className={styles.message}>{copy.message}</Text>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ログイン画面に戻る
      </Button>
    </Col>
  );
};
