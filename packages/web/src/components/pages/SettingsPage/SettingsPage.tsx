import { SettingsPanel } from "@components/organisms/settings";
import { ViewPageProps } from "@types";

export const SettingsPage = ({
  themeMode,
  onThemeModeChange,
  sendKeyMode,
  onSendKeyModeChange,
  agentConnection,
  onAgentConnectionChange,
}: ViewPageProps) => {
  return (
    <SettingsPanel
      themeMode={themeMode}
      onThemeModeChange={onThemeModeChange}
      sendKeyMode={sendKeyMode}
      onSendKeyModeChange={onSendKeyModeChange}
      agentConnection={agentConnection}
      onAgentConnectionChange={onAgentConnectionChange}
    />
  );
};
