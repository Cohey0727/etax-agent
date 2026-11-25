import { FormEvent } from "react";
import { Button, Col, Icon, LoadingCircle } from "@components/atoms";
import { FormField } from "@components/molecules";
import styles from "./MagicLinkForm.css";

export interface MagicLinkFormProps {
  email: string;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

/**
 * MagicLinkForm — メールリンク（マジックリンク）の送信フォーム（organisms/auth）。
 */
export const MagicLinkForm = ({
  email,
  busy,
  onEmailChange,
  onSubmit,
  onBack,
}: MagicLinkFormProps) => {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={handleSubmit}>
      <Col gap="md">
        <FormField
          id="auth-magic-email"
          label="メールアドレス"
          icon="mail"
          size="lg"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="email"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          className={styles.submit}
          disabled={busy || !email}
          disabledReason={busy ? "送信中です" : !email ? "メールアドレスを入力してください" : undefined}
        >
          {busy ? (
            <>
              <LoadingCircle />
              送信中…
            </>
          ) : (
            <>
              <Icon name="send" size={16} />
              ログインリンクを送る
            </>
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          パスワードでログイン
        </Button>
      </Col>
    </form>
  );
};
