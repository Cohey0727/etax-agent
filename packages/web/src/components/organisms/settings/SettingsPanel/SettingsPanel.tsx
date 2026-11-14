import { Button, Card, Col, Icon, IconName, Text } from "@components/atoms";
import { ThemeMode } from "@types";
import styles from "./SettingsPanel.css";

export interface SettingsPanelProps {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

const THEME_OPTIONS: readonly {
  mode: ThemeMode;
  label: string;
  icon: IconName;
  caption: string;
}[] = [
  { mode: "light", label: "ライト", icon: "sun", caption: "常に明るいテーマで表示します" },
  { mode: "dark", label: "ダーク", icon: "moon", caption: "常に暗いテーマで表示します" },
  {
    mode: "system",
    label: "端末に合わせる",
    icon: "settings",
    caption: "端末の外観設定（ライト/ダーク）に追随します",
  },
];

const INFO_ROWS: readonly { label: string; value: string }[] = [
  { label: "アプリ", value: "eTaxAgent — 確定申告 準備ツール" },
  { label: "データの保存先", value: "このブラウザとホームサーバー（帳簿・学習履歴）" },
  { label: "申告の提出", value: "e-Tax での最終提出は納税者本人が行います" },
];

export const SettingsPanel = ({ themeMode, onThemeModeChange }: SettingsPanelProps) => {
  const activeOption = THEME_OPTIONS.find((option) => option.mode === themeMode);
  return (
    <Col gap="lg">
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">外観</Text>
          <Col gap="sm">
            <Text variant="statLabel">テーマ</Text>
            <div className={styles.optionRow}>
              {THEME_OPTIONS.map((option) => (
                <Button
                  key={option.mode}
                  variant={option.mode === themeMode ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => onThemeModeChange(option.mode)}
                  aria-pressed={option.mode === themeMode}
                >
                  <Icon name={option.icon} size={15} />
                  {option.label}
                </Button>
              ))}
            </div>
            {activeOption ? <Text variant="caption">{activeOption.caption}</Text> : null}
          </Col>
        </Col>
      </Card>
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">アプリについて</Text>
          <div>
            {INFO_ROWS.map((row) => (
              <div key={row.label} className={styles.infoRow}>
                <Text variant="statLabel">{row.label}</Text>
                <Text variant="body">{row.value}</Text>
              </div>
            ))}
          </div>
        </Col>
      </Card>
    </Col>
  );
};
