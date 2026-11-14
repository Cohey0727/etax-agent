import { Transaction } from "@etax/shared";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Button, Col, LoadingCircle, Row, Text, Textarea } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { AppView, AgentConnectionConfig, ChatMessage, ChatRole, SendKeyMode, ThemeMode } from "@types";
import {
  agentChat,
  ChatSession,
  loadCurrentMessages,
  saveCurrentMessages,
} from "@utils";
import styles from "./AgentChatPanel.css";

/**
 * エージェントが代行する画面操作。ツール実行結果から導き、AppPage が実際の状態変更を行う。
 * - setYear: 年度切替（集計・消費税計算が対象年を引いたとき）
 * - navigate: 画面遷移（集計系はダッシュボード、修正申告の差分は修正申告画面）
 */
export type AgentUiAction =
  | { type: "setYear"; year: number }
  | { type: "navigate"; view: AppView }
  | { type: "setTheme"; mode: ThemeMode };

export interface AgentChatPanelProps {
  transactions: Transaction[];
  onUiAction?: (action: AgentUiAction) => void;
  /** チャットの送信キー（設定画面で切替、AppPage が保持） */
  sendKeyMode: SendKeyMode;
  /** 外部接続（AI）の上書き設定（設定画面で入力、AppPage が保持） */
  agentConnection: AgentConnectionConfig;
  /** 保存済みの過去の会話（履歴の状態は AppPage が保持し、見出し横のボタンと共有する） */
  sessions: ChatSession[];
  historyOpen: boolean;
  viewing: ChatSession | null;
  onSelectSession: (session: ChatSession) => void;
  /** クリア時に現在の会話を履歴へ保存する。 */
  onArchive: (messages: ChatMessage[]) => void;
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
    } else if (tc.name === "set_theme") {
      const mode = tc.arguments.mode;
      if (mode === "light" || mode === "dark" || mode === "system") {
        push({ type: "setTheme", mode });
      }
    }
  }
  return actions;
};

// 送信キーの修飾キー表示。Mac は ⌘、それ以外（Windows 等）は Ctrl。
const MOD_KEY_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "")
    ? "⌘"
    : "Ctrl";

export const AgentChatPanel = ({
  transactions,
  onUiAction,
  sendKeyMode,
  agentConnection,
  sessions,
  historyOpen,
  viewing,
  onSelectSession,
  onArchive,
}: AgentChatPanelProps) => {
  // 会話は端末に保存し、再読み込みしても続きから使えるようにする。
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadCurrentMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inHistory = historyOpen || viewing !== null;

  // 新しいメッセージが来たら会話ログを一番下までスクロールする（履歴閲覧時は先頭から）。
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = viewing ? 0 : el.scrollHeight;
  }, [messages, loading, viewing, historyOpen]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: ChatRole.User, content: text }];
    setMessages(next);
    saveCurrentMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await agentChat(next, transactions, agentConnection);
      const answered: ChatMessage[] = [...next, { role: ChatRole.Assistant, content: res.reply }];
      setMessages(answered);
      saveCurrentMessages(answered);
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

  // クリア = いまの会話を履歴へ保存してから空にする（履歴から後で見返せる）。
  const clearChat = () => {
    if (messages.length === 0) return;
    onArchive(messages);
    setMessages([]);
    saveCurrentMessages([]);
  };

  return (
    <div className={styles.root}>
      <Text variant="muted">
        質問や、集計・計算などの処理を頼めます。例:
        「2024年の所得を集計して」「2024年の消費税を3方式で比べて」
      </Text>
      {!inHistory && messages.length > 0 ? (
        <Row gap="sm" align="center" justify="end">
          <Button variant="ghost" size="sm" onClick={clearChat} disabled={loading}>
            クリア
          </Button>
        </Row>
      ) : null}

      {viewing ? (
        <div className={styles.chatLog} ref={logRef}>
          <Text variant="muted">
            {formatSessionDate(viewing.savedAt)} の会話（保存済み・{viewing.messages.length}件）
          </Text>
          <MessageBubbles items={viewing.messages} />
        </div>
      ) : historyOpen ? (
        <div className={styles.chatLog} ref={logRef}>
          <Col gap="sm">
            {sessions.map((session) => (
              <Button
                key={session.id}
                variant="ghost"
                size="sm"
                className={styles.sessionItem}
                onClick={() => onSelectSession(session)}
              >
                <Col gap="none">
                  <Text variant="caption">
                    {formatSessionDate(session.savedAt)} ・ {session.messages.length}件
                  </Text>
                  <Text>{sessionExcerpt(session)}</Text>
                </Col>
              </Button>
            ))}
          </Col>
        </div>
      ) : (
        <>
          <div className={styles.chatLog} ref={logRef}>
            <MessageBubbles items={messages} />
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
        </>
      )}
    </div>
  );
};

/** 会話の吹き出し列。進行中の会話と履歴閲覧で共用する（助手は Markdown で描く）。 */
const MessageBubbles = ({ items }: { items: ChatMessage[] }) => {
  return (
    <>
      {items.map((m, i) =>
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
    </>
  );
};

function formatSessionDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ").replaceAll("-", "/");
}

/** 履歴一覧に出す、その会話の最初の質問の抜粋。 */
function sessionExcerpt(session: ChatSession): string {
  const first = session.messages.find((m) => m.role === ChatRole.User) ?? session.messages[0];
  const text = first?.content.replaceAll("\n", " ") ?? "";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}
