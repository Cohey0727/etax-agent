/**
 * McpConnectionPanel.tsx — MCP 接続セクション（MCP設定ページ）。
 *
 * エンドポイント URL の表示とコピー、接続手順、主要クライアント向けの
 * 設定スニペット（mcpServers 形式の JSON）、利用できるツールの一覧を出す。
 * ツール一覧はサーバーの /api/auth/mcp-info が正本（MCP_TOOLS の写し）。
 */
import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  Col,
  Input,
  Row,
  SkeletonBar,
  Table,
  TableCell,
  TableHeaderCell,
  Text,
} from "@components/atoms";
import { Tabs } from "@components/molecules";
import { McpInfo } from "@types";
import { fetchMcpInfo } from "@utils";
import styles from "./McpConnectionPanel.css";

type LoadState = "loading" | "anonymous" | "ready";

type ClientId = "claudeCode" | "codex" | "muse";

interface ClientSnippet {
  /** スニペットを貼る場所の案内。 */
  hint: string;
  build: (endpoint: string) => string;
}

/** クライアント別の設定スニペット（列挙分岐はマッピング表で持つ）。 */
const CLIENT_SNIPPETS: Record<ClientId, ClientSnippet> = {
  claudeCode: {
    hint: "プロジェクト直下の .mcp.json（または ~/.claude.json）の mcpServers に追加します。コマンドなら: claude mcp add --transport http etax-agent <URL> --header \"Authorization: Bearer YOUR_API_KEY\"",
    build: (endpoint) => buildSnippetJson(endpoint),
  },
  codex: {
    hint: "Codex の MCP 設定の mcpServers に追加します。",
    build: (endpoint) => buildSnippetJson(endpoint),
  },
  muse: {
    hint: "Muse の MCP 設定の mcpServers に追加します。",
    build: (endpoint) => buildSnippetJson(endpoint),
  },
};

const CLIENT_TABS: readonly { id: ClientId; label: string }[] = [
  { id: "claudeCode", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "muse", label: "Muse" },
];

/** 読み込み中に代わりへ出すスケルトンの行数。 */
const SKELETON_ROWS: readonly number[] = [1, 2, 3];

export const McpConnectionPanel = () => {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [info, setInfo] = useState<McpInfo | null>(null);
  const [clientId, setClientId] = useState<ClientId>("claudeCode");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchMcpInfo();
      setInfo(data);
      setLoadState("ready");
    } catch {
      setLoadState("anonymous");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const endpoint = info ? `${window.location.origin}${info.endpoint_path}` : "";
  const snippet = CLIENT_SNIPPETS[clientId];

  const handleCopy = async (text: string, doneText: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ ok: true, text: doneText });
    } catch {
      setMessage({
        ok: false,
        text: "コピーに失敗しました。表示されている内容を選択してコピーしてください",
      });
    }
  };

  return (
    <Card>
      <Col gap="md">
        <Text variant="sectionTitle">MCP接続</Text>
        <Text variant="caption">
          MCP（Model Context Protocol）対応の外部エージェントから、このアカウントの帳簿・税額計算・XTX生成を使えるようにする接続情報です。接続には下のエンドポイントと、APIキー（このページの「APIキー」で発行）を使います。
        </Text>
        {loadState === "loading" ? (
          <Col gap="sm" aria-hidden="true">
            {SKELETON_ROWS.map((row) => (
              <SkeletonBar key={row} height={28} />
            ))}
          </Col>
        ) : loadState === "anonymous" || !info ? (
          <Text variant="caption">
            接続情報の表示にはログインが必要です（認証が有効な運用でのみ使えます）。
          </Text>
        ) : (
          <>
            <Col gap="sm">
              <Text variant="statLabel">エンドポイント</Text>
              <Row gap="sm" align="center">
                <Input
                  value={endpoint}
                  readOnly
                  aria-label="MCPエンドポイント"
                  className={styles.endpointInput}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleCopy(endpoint, "エンドポイントをコピーしました")}
                >
                  コピー
                </Button>
              </Row>
              <Text variant="caption">
                認証は Authorization: Bearer &lt;APIキー&gt; ヘッダーで行います。
              </Text>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">接続手順</Text>
              <Text variant="caption">1. このページの「APIキー」でキーを発行し、控えます。</Text>
              <Text variant="caption">
                2. 使うクライアントの設定に、下のスニペットを貼り付け、YOUR_API_KEY
                を発行したキーに差し替えます。
              </Text>
              <Text variant="caption">3. クライアントを再起動すると、ツールが使えるようになります。</Text>
            </Col>
            <Col gap="sm">
              <Tabs items={CLIENT_TABS} activeId={clientId} onChange={setClientId} />
              <pre className={styles.codeBlock}>{snippet.build(endpoint)}</pre>
              <Row gap="sm" align="center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void handleCopy(snippet.build(endpoint), "設定スニペットをコピーしました")
                  }
                >
                  スニペットをコピー
                </Button>
              </Row>
              <Text variant="caption">{snippet.hint}</Text>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">利用できるツール（全{info.tool_count}件）</Text>
              <div className={styles.toolList}>
                <Table>
                  <thead>
                    <tr>
                      <TableHeaderCell>ツール</TableHeaderCell>
                      <TableHeaderCell>説明</TableHeaderCell>
                    </tr>
                  </thead>
                  <tbody>
                    {info.tools.map((tool) => (
                      <tr key={tool.name}>
                        <TableCell>{tool.name}</TableCell>
                        <TableCell>{tool.description}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <Text variant="caption">
                e-Tax への提出はこの接続からは行いません（提出は納税者本人の操作です）。APIキーの発行・失効もこの画面でのみ行えます。
              </Text>
            </Col>
          </>
        )}
        {message ? (
          <Text variant="caption">
            {message.ok ? "✓ " : "⚠ "}
            {message.text}
          </Text>
        ) : null}
      </Col>
    </Card>
  );
};

/** mcpServers 形式の設定スニペット。YOUR_API_KEY を発行したキーに差し替えて使う。 */
function buildSnippetJson(endpoint: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        "etax-agent": {
          type: "http",
          url: endpoint,
          headers: { Authorization: "Bearer YOUR_API_KEY" },
        },
      },
    },
    null,
    2,
  );
}
