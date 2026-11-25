import { FormEvent } from "react";
import { Button, Col, LoadingCircle } from "@components/atoms";
import { FormField, PasswordField } from "@components/molecules";
import { LoginMode } from "@types";
import styles from "./PasswordAuthForm.css";

export type PasswordAuthMode = Extract<LoginMode, "login" | "register">;

export interface PasswordAuthFormProps {
  mode: PasswordAuthMode;
  email: string;
  secret: string;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onSecretChange: (value: string) => void;
  onSubmit: () => void;
}

// モードごとの文案。列挙分岐はこのマッピング表に寄せる。
const FORM_COPY: Record<
  PasswordAuthMode,
  {
    passwordPlaceholder: string;
    autoComplete: string;
    submitLabel: string;
    busyLabel: string;
  }
> = {
  login: {
    passwordPlaceholder: "パスワード",
    autoComplete: "current-password",
    submitLabel: "ログイン",
    busyLabel: "ログイン中…",
  },
  register: {
    passwordPlaceholder: "8文字以上",
    autoComplete: "new-password",
    submitLabel: "登録する",
    busyLabel: "登録中…",
  },
};

/**
 * PasswordAuthForm — メール＋パスワードのフォーム（organisms/auth）。
 * Enter でも送信できるよう form で包み、送信処理そのものは親に委ねる。
 */
export const PasswordAuthForm = ({
  mode,
  email,
  secret,
  busy,
  onEmailChange,
  onSecretChange,
  onSubmit,
}: PasswordAuthFormProps) => {
  const copy = FORM_COPY[mode];
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={handleSubmit}>
      <Col gap="md">
        <FormField
          id="auth-email"
          label="メールアドレス"
          icon="mail"
          size="lg"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          autoComplete="email"
        />
        <PasswordField
          id="auth-password"
          label="パスワード"
          size="lg"
          placeholder={copy.passwordPlaceholder}
          value={secret}
          onChange={(e) => onSecretChange(e.target.value)}
          autoComplete={copy.autoComplete}
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          className={styles.submit}
          disabled={busy || !email || !secret}
          disabledReason={
            busy
              ? "処理中です"
              : !email || !secret
                ? "メールアドレスとパスワードを入力してください"
                : undefined
          }
        >
          {busy ? (
            <>
              <LoadingCircle />
              {copy.busyLabel}
            </>
          ) : (
            copy.submitLabel
          )}
        </Button>
      </Col>
    </form>
  );
};
