import { ComponentType } from "react";
import { Button, Col, Row, Text } from "@components/atoms";
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
const providerLogos = {
  google: GoogleLogo,
  github: GitHubLogo,
} as const satisfies Record<OAuthProviderKey, ComponentType>;

/**
 * OAuthButtons — 「または」の区切りと外部ログインのボタン群（organisms/auth）。
 * ボタンには公式ロゴマークを入れ、押下時の遷移は親に委ねる。
 */
export const OAuthButtons = ({ providers, onSelect }: OAuthButtonsProps) => {
  if (providers.length === 0) return null;
  return (
    <Col gap="sm">
      <Row gap="sm" align="center">
        <span className={styles.dividerLine} />
        <Text variant="caption" className={styles.dividerText}>
          または
        </Text>
        <span className={styles.dividerLine} />
      </Row>
      {providers.map((provider) => {
        const ProviderLogo = providerLogos[provider.key];
        return (
          <Button
            key={provider.key}
            variant="ghost"
            size="md"
            className={styles.button}
            onClick={() => onSelect(provider.key)}
          >
            <ProviderLogo />
            {provider.label}
          </Button>
        );
      })}
    </Col>
  );
};
