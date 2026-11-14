import { Transaction } from "@etax/shared";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Button, Input, LoadingCircle, Row, Text } from "@components/atoms";
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
  [AppView.Receipt]: "領収書から帳簿",
  [AppView.Amend]: "修正申告",
  [AppView.Ledger]: "帳簿",
  [AppView.Filing]: "確定申告",
  [AppView.Settings]: "設定",
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
  const logRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージが来たら会話ログを一番下までスクロールする。
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

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
    <div className={styles.root}>
      <Text variant="muted">
        表示中の取引データ（{transactions.length}件）を添付して質問します。集計・計算はツールが
        実行し、年度切替や画面遷移も代行します。金額はLLMが作らず、決定的な計算で出します。
      </Text>
      <div className={styles.chatLog} ref={logRef}>
        {messages.length === 0 && (
          <Text variant="muted">
            例: 「2024年の所得を集計して」「2024年の消費税を3方式で比べて」
          </Text>
        )}
        {messages.map((m, i) =>
          m.role === ChatRole.Assistant ? (
            <div key={i} className={clsx(styles.bubble, styles.role[m.role])}>
              <div className={styles.markdown}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, rehypeSanitize]}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          ) : (
            <div key={i} className={clsx(styles.bubble, styles.role[m.role])}>
              {m.content}
            </div>
          ),
        )}
        {loading && (
          <div className={clsx(styles.bubble, styles.role[ChatRole.Assistant])}>
            <Row gap="sm" align="center">
              <LoadingCircle />
              <span>考え中…</span>
            </Row>
          </div>
        )}
      </div>
      {error && <AlertBox variant="error">{error}</AlertBox>}
      {actionLog.length > 0 && (
        <Text variant="muted">画面操作: {actionLog.slice(-3).join(" ／ ")}</Text>
      )}
      {toolLog.length > 0 && (
        <Text variant="muted">実行したツール: {toolLog.slice(-5).join(" / ")}</Text>
      )}
      <Row gap="sm" className={styles.inputRow}>
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
    </div>
  );
};
