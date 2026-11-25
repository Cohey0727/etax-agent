import { Col } from "@components/atoms";
import { ApiKeysPanel, McpConnectionPanel } from "@components/organisms/settings";

/**
 * MCP設定ページ。外部エージェント（MCPクライアント）との接続に必要な
 * APIキーの管理と接続情報をまとめた画面。キーの発行・失効は権限昇格に
 * あたるため、MCPツール化せずこの画面（人間の操作）だけが正規経路。
 */
export const McpSettingsPage = () => {
  return (
    <Col gap="lg">
      <ApiKeysPanel />
      <McpConnectionPanel />
    </Col>
  );
};
