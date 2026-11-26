import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { McpInfo, fetchMcpInfo } from "@/api";
import { API_URL } from "@/config";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { SkeletonCard } from "@/components/Skeleton";
import { Tabs } from "@/components/Tabs";
import { space } from "@/theme";
import { copyText } from "../copyText";

type ClientId = "claudeCode" | "codex" | "muse";

const CLIENT_TABS: readonly { id: ClientId; label: string }[] = [
  { id: "claudeCode", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "muse", label: "Muse" },
];

const CLIENT_HINTS: Record<ClientId, string> = {
  claudeCode:
    "プロジェクト直下の .mcp.json（または ~/.claude.json）の mcpServers に追加します。",
  codex: "Codex の MCP 設定の mcpServers に追加します。",
  muse: "Muse の MCP 設定の mcpServers に追加します。",
};

/** クライアント向け設定スニペット（mcpServers 形式の JSON）。 */
export function buildSnippetJson(endpoint: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "etax-agent": {
          type: "http",
          url: endpoint,
          headers: { Authorization: "Bearer <APIキー>" },
        },
      },
    },
    null,
    2,
  );
}

/** MCP の接続情報（エンドポイント・手順・スニペット・ツール一覧）。 */
export function McpConnectionPanel() {
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [clientId, setClientId] = useState<ClientId>("claudeCode");
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setInfo(await fetchMcpInfo());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!info) {
    return failed ? (
      <Card>
        <AppText size="lg" weight="bold">
          MCP接続
        </AppText>
        <AppText size="sm" tone="muted">
          接続情報の表示にはログインが必要です（認証が有効な運用でのみ使えます）。
        </AppText>
      </Card>
    ) : (
      <SkeletonCard />
    );
  }

  const endpoint = `${API_URL}${info.endpoint_path}`;
  const snippet = buildSnippetJson(endpoint);

  const handleCopy = async (text: string, doneText: string) => {
    setMessage((await copyText(text)) ? doneText : "共有シートを開けませんでした");
  };

  return (
    <Card>
      <AppText size="lg" weight="bold">
        MCP接続
      </AppText>
      <AppText size="sm" tone="muted">
        MCP（Model Context Protocol）対応の外部エージェントから、このアカウントの帳簿・税額計算・XTX生成を使えるようにする接続情報です。接続には下のエンドポイントと、APIキー（このページの「APIキー」で発行）を使います。
      </AppText>
      <AppText size="sm" weight="semibold" tone="subtle">
        エンドポイント
      </AppText>
      <AppText size="sm" selectable>
        {endpoint}
      </AppText>
      <AppButton
        label="エンドポイントをコピー"
        variant="ghost"
        size="sm"
        onPress={() => void handleCopy(endpoint, "エンドポイントを共有しました")}
      />
      <AppText size="sm" weight="semibold" tone="subtle">
        接続手順
      </AppText>
      <AppText size="sm" tone="muted">
        1. このページの「APIキー」でキーを発行し、控えます。{"\n"}
        2. 下の設定スニペットの &lt;APIキー&gt; を発行したキーに置き換えて、クライアントの設定に追加します。{"\n"}
        3. クライアントを再起動すると、ツールが使えるようになります。
      </AppText>
      <Tabs items={CLIENT_TABS} activeId={clientId} onChange={setClientId} />
      <AppText size="xs" tone="muted">
        {CLIENT_HINTS[clientId]}
      </AppText>
      <AppText size="xs" selectable style={{ fontFamily: "monospace" }}>
        {snippet}
      </AppText>
      <AppButton
        label="スニペットをコピー"
        variant="ghost"
        size="sm"
        onPress={() => void handleCopy(snippet, "設定スニペットを共有しました")}
      />
      {message ? <AlertBox tone="info" message={message} /> : null}
      <AppText size="sm" weight="semibold" tone="subtle">
        利用できるツール（全{info.tool_count}件）
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {info.tools.map((tool) => (
          <Chip key={tool.name} label={tool.name} />
        ))}
      </View>
    </Card>
  );
}
