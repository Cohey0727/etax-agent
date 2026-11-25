import { ReactNode } from "react";
import { Col, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { LoginMode } from "@types";
import styles from "./LoginFormPanel.css";

export interface LoginFormPanelProps {
  mode: LoginMode;
  error: string | null;
  children: ReactNode;
}

// モードごとの見出し。列挙分岐はこのマッピング表に寄せる。
const MODE_HEADINGS: Record<LoginMode, { title: string; caption: string }> = {
  login: { title: "ログイン", caption: "おかえりなさい。続きは AI が進めます。" },
  register: { title: "アカウント作成", caption: "メールアドレスとパスワードで登録できます。" },
  totp: {
    title: "2段階認証",
    caption: "Authenticator アプリに表示される6桁のコードを入力してください。",
  },
  magic: {
    title: "メールリンクでログイン",
    caption: "パスワードなしで、メールに届くリンクからログインできます。",
  },
  magicSent: { title: "メールを送りました", caption: "受信トレイを確認してください。" },
  verifySent: { title: "確認メールを送りました", caption: "受信トレイを確認してください。" },
};

/**
 * LoginFormPanel — ログイン画面の右側フォームパネル（organisms/auth）。
 * 白カードに見出し・エラー・モード別の中身・フッター注記を収める。
 * 中身はモード切替のたびに弾んで入れ替わる。
 */
export const LoginFormPanel = ({ mode, error, children }: LoginFormPanelProps) => {
  const heading = MODE_HEADINGS[mode];
  return (
    <section className={styles.root}>
      <div className={styles.card}>
        <Col gap="lg">
          <Col gap="sm">
            <Text variant="title">{heading.title}</Text>
            <Text variant="caption" className={styles.caption}>
              {heading.caption}
            </Text>
          </Col>
          {error ? (
            <div className={styles.errorWrap}>
              <AlertBox variant="error">{error}</AlertBox>
            </div>
          ) : null}
          <div key={mode} className={styles.modeContent}>
            {children}
          </div>
          <Text variant="caption" className={styles.footer}>
            申告の提出はご本人が行います。AI は整備の自動化を担います。
          </Text>
        </Col>
      </div>
    </section>
  );
};
