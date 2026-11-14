import { Transaction } from "@etax/shared";
import { clsx } from "clsx";
import { useState } from "react";
import { Button, Card, Col, Input, LoadingCircle, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { ChatMessage, ChatRole } from "@types";
import { agentChat } from "@utils";
import styles from "./AgentChatPanel.css";

export interface AgentChatPanelProps {
  transactions: Transaction[];
}

export const AgentChatPanel = ({ transactions }: AgentChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolLog, setToolLog] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: ChatRole.User, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await agentChat(next, transactions);
      setMessages([...next, { role: ChatRole.Assistant, content: res.reply }]);
      if (res.toolCalls.length > 0) {
        setToolLog((prev) => [
          ...prev,
          ...res.toolCalls.map((tc) => `${tc.name}(${JSON.stringify(tc.arguments)})`),
        ]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 503（キー未設定）などは案内としてそのまま見せる
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Col gap="md">
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">対話エージェント</Text>
          <Text variant="muted">
            現在表示中の取引データ（{transactions.length}件）を添付して質問します。
            金額の計算はツール（決定的な計算）が行い、LLMは数字を作りません。 サーバーに AGENT_API_KEY
            が未設定の場合は利用できません（計算・取込はキー不要です）。
          </Text>
          <Col gap="sm" className={styles.chatLog}>
            {messages.length === 0 && (
              <Text variant="muted">
                例: 「2024年の所得を集計して」「2024年の消費税を3方式で比べて」
              </Text>
            )}
            {messages.map((m, i) => (
              <div key={i} className={clsx(styles.bubble, styles.role[m.role])}>
                {m.content}
              </div>
            ))}
            {loading && (
              <div className={clsx(styles.bubble, styles.role[ChatRole.Assistant])}>
                <Row gap="sm" align="center">
                  <LoadingCircle />
                  <span>考え中…</span>
                </Row>
              </div>
            )}
          </Col>
          {error && <AlertBox variant="error">{error}</AlertBox>}
          <Row gap="sm">
            <Input
              className={styles.inputFlex}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
              }}
              placeholder="質問を入力（Enterで送信）"
              disabled={loading}
            />
            <Button onClick={() => void send()} disabled={loading}>
              送信
            </Button>
          </Row>
          {toolLog.length > 0 && (
            <Text variant="muted">実行したツール: {toolLog.slice(-5).join(" / ")}</Text>
          )}
        </Col>
      </Card>
    </Col>
  );
};
