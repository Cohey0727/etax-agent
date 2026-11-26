import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { LabeledValue } from "@/components/LabeledValue";
import { ScreenContainer } from "@/components/ScreenContainer";
import {
  AccountPanel,
  AgentConnectionPanel,
  AiMemoryPanel,
  SystemOnePanel,
} from "@/features/settings";
import { space } from "@/theme";

const INFO_ROWS: readonly { label: string; value: string }[] = [
  { label: "アプリ", value: "eTaxAgent — 確定申告 準備ツール" },
  { label: "データの保存先", value: "この端末とサーバー（帳簿・学習履歴）" },
  { label: "申告の提出", value: "e-Tax での最終提出は納税者本人が行います" },
];

export default function SettingsScreen() {
  return (
    <ScreenContainer>
      <AccountPanel />
      <AgentConnectionPanel />
      <SystemOnePanel />
      <AiMemoryPanel />
      <Card>
        <AppText size="lg" weight="bold">
          アプリについて
        </AppText>
        <View style={{ gap: space.xs }}>
          {INFO_ROWS.map((row) => (
            <LabeledValue key={row.label} label={row.label} value={row.value} />
          ))}
        </View>
      </Card>
    </ScreenContainer>
  );
}
