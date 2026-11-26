import { ScreenContainer } from "@/components/ScreenContainer";
import { ApiKeysPanel, McpConnectionPanel } from "@/features/mcp";

export default function McpSettingsScreen() {
  return (
    <ScreenContainer>
      <ApiKeysPanel />
      <McpConnectionPanel />
    </ScreenContainer>
  );
}
