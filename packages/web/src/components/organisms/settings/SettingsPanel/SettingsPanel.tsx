import { useState } from "react";
import { Button, Card, Col, Icon, IconName, Input, Row, Text } from "@components/atoms";
import { AgentConnectionConfig, SendKeyMode, ThemeMode } from "@types";
import { testAgentSettings } from "@utils";
import { AiMemoryPanel } from "../AiMemoryPanel";
import { AccountPanel } from "../AccountPanel";
import { SystemOneSettingsPanel } from "../SystemOneSettingsPanel";
import styles from "./SettingsPanel.css";

interface StatusMessage {
  ok: boolean;
  text: string;
}

export interface SettingsPanelProps {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  sendKeyMode: SendKeyMode;
  onSendKeyModeChange: (mode: SendKeyMode) => void;
  agentConnection: AgentConnectionConfig;
  onAgentConnectionChange: (config: AgentConnectionConfig) => void;
}

const THEME_OPTIONS: readonly {
  mode: ThemeMode;
  label: string;
  icon: IconName;
  caption: string;
}[] = [
  {
    mode: "system",
    label: "端末に合わせる",
    icon: "settings",
    caption: "端末の外観設定（ライト/ダーク）に追随します",
  },
  { mode: "light", label: "ライト", icon: "sun", caption: "常に明るいテーマで表示します" },
  { mode: "dark", label: "ダーク", icon: "moon", caption: "常に暗いテーマで表示します" },
];

const SEND_KEY_OPTIONS: readonly { mode: SendKeyMode; label: string; caption: string }[] = [
  { mode: "enter", label: "Enter", caption: "Enterで送信します（Shift+Enterで改行）" },
  {
    mode: "modEnter",
    label: "⌘ + Enter",
    caption: "⌘+Enter（WindowsはCtrl+Enter）で送信します（Enterで改行）",
  },
];

const INFO_ROWS: readonly { label: string; value: string }[] = [
  { label: "アプリ", value: "eTaxAgent — 確定申告丸投げ" },
  { label: "データの保存先", value: "このブラウザとサーバー（帳簿・学習履歴）" },
  { label: "申告の提出", value: "e-Tax での最終提出は納税者本人が行います" },
];

export const SettingsPanel = ({
  themeMode,
  onThemeModeChange,
  sendKeyMode,
  onSendKeyModeChange,
  agentConnection,
  onAgentConnectionChange,
}: SettingsPanelProps) => {
  const activeOption = THEME_OPTIONS.find((option) => option.mode === themeMode);
  const activeSendKeyOption = SEND_KEY_OPTIONS.find((option) => option.mode === sendKeyMode);
  const [agentTestBusy, setAgentTestBusy] = useState(false);
  const [agentTestMessage, setAgentTestMessage] = useState<StatusMessage | null>(null);

  const handleAgentTest = async () => {
    setAgentTestBusy(true);
    setAgentTestMessage(null);
    try {
      const result = await testAgentSettings({
        baseUrl: agentConnection.baseUrl.trim() || undefined,
        model: agentConnection.model.trim() || undefined,
        apiKey: agentConnection.apiKey ? agentConnection.apiKey : undefined,
      });
      setAgentTestMessage(
        result.ok
          ? {
              ok: true,
              text: `接続できました（モデル: ${result.model ?? "—"}、応答: ${result.reply ?? "—"}）`,
            }
          : { ok: false, text: `接続できませんでした: ${result.error ?? "不明なエラー"}` },
      );
    } catch {
      setAgentTestMessage({ ok: false, text: "接続テストに失敗しました" });
    } finally {
      setAgentTestBusy(false);
    }
  };
  return (
    <Col gap="lg">
      <AccountPanel />
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
          <Text variant="sectionTitle">チャット</Text>
          <Col gap="sm">
            <Text variant="statLabel">送信キー</Text>
            <div className={styles.optionRow}>
              {SEND_KEY_OPTIONS.map((option) => (
                <Button
                  key={option.mode}
                  variant={option.mode === sendKeyMode ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => onSendKeyModeChange(option.mode)}
                  aria-pressed={option.mode === sendKeyMode}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            {activeSendKeyOption ? (
              <Text variant="caption">{activeSendKeyOption.caption}</Text>
            ) : null}
            <Text variant="caption">
              日本語入力の変換確定（Enter）では、どちらの設定でも送信しません。
            </Text>
          </Col>
        </Col>
      </Card>
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">外部接続（AI）</Text>
          <Col gap="sm">
            <Text variant="statLabel">ベースURL</Text>
            <Input
              value={agentConnection.baseUrl}
              onChange={(e) =>
                onAgentConnectionChange({ ...agentConnection, baseUrl: e.target.value })
              }
              placeholder="AIサービスのベースURL"
              autoComplete="off"
            />
          </Col>
          <Col gap="sm">
            <Text variant="statLabel">モデル</Text>
            <Input
              value={agentConnection.model}
              onChange={(e) =>
                onAgentConnectionChange({ ...agentConnection, model: e.target.value })
              }
              placeholder="モデル名"
              autoComplete="off"
            />
          </Col>
          <Col gap="sm">
            <Text variant="statLabel">APIキー</Text>
            <Input
              type="password"
              value={agentConnection.apiKey}
              onChange={(e) =>
                onAgentConnectionChange({ ...agentConnection, apiKey: e.target.value })
              }
              placeholder="未入力ならサーバーの設定を使います"
              autoComplete="off"
            />
          </Col>
          <Row gap="sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleAgentTest()}
              disabled={agentTestBusy}
              disabledReason="テスト中です"
            >
              {agentTestBusy ? "接続テスト中…" : "接続テスト"}
            </Button>
          </Row>
          {agentTestMessage ? (
            <Text variant="caption">
              {agentTestMessage.ok ? "✓ " : "⚠ "}
              {agentTestMessage.text}
            </Text>
          ) : null}
          <Text variant="caption">
            入力した項目だけがサーバーの設定より優先されます。APIキーはこの端末にだけ保存され、チャット送信時にのみサーバーへ送られます。
          </Text>
        </Col>
      </Card>
      <SystemOneSettingsPanel />
      <AiMemoryPanel />
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
