import { Transaction } from "@etax/shared";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Button, LoadingCircle, Row, Text, Textarea } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { AppView, ChatMessage, ChatRole, SendKeyMode } from "@types";
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
  /** チャットの送信キー（設定画面で切替、AppPage が保持） */
  sendKeyMode: SendKeyMode;
}

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

// 送信キーの修飾キー表示。Mac は ⌘、それ以外（Windows 等）は Ctrl。
const MOD_KEY_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "")
    ? "⌘"
    : "Ctrl";

export const AgentChatPanel = ({ transactions, onUiAction, sendKeyMode }: AgentChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
        // 画面操作は裏でだけ行い、ログとしては表示しない（会話の邪魔になるため）。
        const actions = deriveUiActions(res.toolCalls);
        if (onUiAction && actions.length > 0) {
          actions.forEach((action) => onUiAction(action));
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
      <Text variant="muted">質問や、集計・計算などの処理を頼めます。</Text>
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
      <Row gap="sm" align="end" className={styles.inputRow}>
        <Textarea
          className={styles.inputFlex}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            // 日本語入力の変換確定Enterでは絶対に送らない。
            if (e.nativeEvent.isComposing) return;
            const modPressed = e.metaKey || e.ctrlKey;
            const shouldSend =
              sendKeyMode === "modEnter" ? modPressed : !e.shiftKey && !modPressed;
            if (shouldSend) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={
            sendKeyMode === "modEnter"
              ? `質問を入力（${MOD_KEY_LABEL}+Enterで送信・Enterで改行）`
              : "質問を入力（Enterで送信・Shift+Enterで改行）"
          }
          rows={2}
          disabled={loading}
        />
        <Button onClick={() => void send()} disabled={loading}>
          送信
        </Button>
      </Row>
    </div>
  );
};
