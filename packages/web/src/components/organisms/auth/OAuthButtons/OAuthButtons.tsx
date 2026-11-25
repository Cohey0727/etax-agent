import { ReactNode } from "react";
import { Button, Col, Text } from "@components/atoms";
import styles from "./OAuthButtons.css";
import { GitHubLogo, GoogleLogo } from "./oauthLogos";

export type OAuthProviderKey = "google" | "github";

export interface OAuthProvider {
  key: OAuthProviderKey;
  label: string;
}

export interface OAuthButtonsProps {
  providers: readonly OAuthProvider[];
  onSelect: (key: OAuthProviderKey) => void;
}

// プロバイダごとの公式ロゴ。列挙分岐はこのマッピング表に寄せる。
const PROVIDER_LOGOS: Record<OAuthProviderKey, ReactNode> = {
  google: <GoogleLogo />,
  github: <GitHubLogo />,
};

/**
 * OAuthButtons — 「または」の区切りと外部ログインのボタン群（organisms/auth）。
 * ボタンには公式ロゴマークを入れ、押下時の遷移は親に委ねる。
 */
export const OAuthButtons = ({ providers, onSelect }: OAuthButtonsProps) => {
  if (providers.length === 0) return null;
  return (
    <Col gap="sm">
      <div className={styles.divider}>
        <span className={styles.dividerLine} />
        <Text variant="caption" className={styles.dividerText}>
          または
        </Text>
        <span className={styles.dividerLine} />
      </div>
      {providers.map((provider) => (
        <Button
          key={provider.key}
          variant="ghost"
          size="md"
          className={styles.button}
          onClick={() => onSelect(provider.key)}
        >
          {PROVIDER_LOGOS[provider.key]}
          {provider.label}
        </Button>
      ))}
    </Col>
  );
};
