import { Button } from "@components/atoms";
import { PasswordAuthMode } from "@components/organisms/auth/PasswordAuthForm";
import styles from "./AuthModeTabs.css";

export interface AuthModeTabsProps {
  mode: PasswordAuthMode;
  onChange: (mode: PasswordAuthMode) => void;
}

const TABS: readonly { key: PasswordAuthMode; label: string }[] = [
  { key: "login", label: "ログイン" },
  { key: "register", label: "新規登録" },
];

/**
 * AuthModeTabs — ログイン／新規登録の切り替えピル（organisms/auth）。
 * 選択中はアクセントで満たされ、切り替えのたびに小さく弾む（Button の tab 系バリアント）。
 */
export const AuthModeTabs = ({ mode, onChange }: AuthModeTabsProps) => {
  return (
    <div className={styles.root}>
      {TABS.map((tab) => (
        <Button
          key={tab.key}
          type="button"
          variant={mode === tab.key ? "tabActive" : "tab"}
          size="md"
          className={styles.tab}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </Button>
      ))}
    </div>
  );
};
