import { Transaction } from "@etax/shared";
import { clsx } from "clsx";
import { useState } from "react";
import { Button, Card, Col, Input, LoadingCircle, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { AppView, ChatMessage, ChatRole } from "@types";
import { agentChat } from "@utils";
import styles from "./AgentChatPanel.css";

/**
 * エージェントが代行する画面操作。ツール実行結果から導き、AppPage が実際の状態変更を行う。
 * - setYear: 年度切替（集計・消費税計算が対象年を引いたとき）
 * - navigate: 画面遷移（集計系はダッシュボード、修正申告の差分は修正申告画面）
 */
export type AgentUiAction =
  | { type: "setYear"; year: number }
  | { type: "navigate"; view: AppView };

export interface AgentChatPanelProps {
  transactions: Transaction[];
  onUiAction?: (action: AgentUiAction) => void;
}

const viewLabels: Record<string, string> = {
  [AppView.Dashboard]: "ダッシュボード",
  [AppView.Import]: "取引・CSV取込",
  [AppView.Amend]: "修正申告",
};

// ツール実行結果 → 画面操作。同じ操作は1ターンに1回だけ。
const deriveUiActions = (toolCalls: { name: string; arguments: Record<string, unknown> }[]) => {
  const actions: AgentUiAction[] = [];
  const seen = new Set<string>();
  const push = (action: AgentUiAction) => {
    const key = JSON.stringify(action);
    if (!seen.has(key)) {
      seen.add(key);
      actions.push(action);
    }
  };
  for (const tc of toolCalls) {
    if (tc.name === "aggregate_year" || tc.name === "consumption_tax") {
      if (typeof tc.arguments.year === "number") {
        push({ type: "setYear", year: tc.arguments.year });
      }
      push({ type: "navigate", view: AppView.Dashboard });
    } else if (tc.name === "amendment_delta") {
      push({ type: "navigate", view: AppView.Amend });
    }
  }
  return actions;
};

const describeUiAction = (action: AgentUiAction) => {
  return action.type === "setYear"
    ? `年度を${action.year}年に切り替えました`
    : `${viewLabels[action.view] ?? action.view}を開きました`;
};

export const AgentChatPanel = ({ transactions, onUiAction }: AgentChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [toolLog, setToolLog] = useState<string[]>([]);
  const [actionLog, setActionLog] = useState<string[]>([]);
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
        const actions = deriveUiActions(res.toolCalls);
        if (onUiAction && actions.length > 0) {
          actions.forEach((action) => onUiAction(action));
          setActionLog((prev) => [...prev, ...actions.map(describeUiAction)]);
        }
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
          <Text variant="muted">
            質問への回答に加えて、画面操作の代行もできます（年度の切替・画面の遷移・集計や税額計算の実行）。
            現在表示中の取引データ（{transactions.length}件）を添付して質問します。
            金額の計算はツール（決定的な計算）が行い、LLMは数字を作りません。
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
          {actionLog.length > 0 && (
            <Text variant="muted">画面操作: {actionLog.slice(-3).join(" ／ ")}</Text>
          )}
          {toolLog.length > 0 && (
            <Text variant="muted">実行したツール: {toolLog.slice(-5).join(" / ")}</Text>
          )}
        </Col>
      </Card>
    </Col>
  );
};
