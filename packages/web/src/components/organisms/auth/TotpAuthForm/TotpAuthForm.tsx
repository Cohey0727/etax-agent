import { FormEvent } from "react";
import { Button, Col, LoadingCircle } from "@components/atoms";
import { FormField } from "@components/molecules";
import styles from "./TotpAuthForm.css";

export interface TotpAuthFormProps {
  code: string;
  busy: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: () => void;
  onRestart: () => void;
}

/**
 * TotpAuthForm — TOTP 2段階認証のコード入力フォーム（organisms/auth）。
 * コードは大きく中央に打ち込む形にして、Authenticator アプリとの往復を楽にする。
 */
export const TotpAuthForm = ({
  code,
  busy,
  onCodeChange,
  onSubmit,
  onRestart,
}: TotpAuthFormProps) => {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={handleSubmit}>
      <Col gap="md">
        <FormField
          id="auth-totp-code"
          label="認証コード"
          icon="key"
          size="lg"
          className={styles.codeInput}
          inputMode="numeric"
          placeholder="123456"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          autoComplete="one-time-code"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          className={styles.submit}
          disabled={busy || code.length < 6}
          disabledReason={
            busy ? "確認中です" : code.length < 6 ? "6桁のコードを入力してください" : undefined
          }
        >
          {busy ? (
            <>
              <LoadingCircle />
              確認中…
            </>
          ) : (
            "確認してログイン"
          )}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRestart}>
          最初からやり直す
        </Button>
      </Col>
    </form>
  );
};
