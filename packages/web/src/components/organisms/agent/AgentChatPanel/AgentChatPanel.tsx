import { Transaction } from "@etax/shared";
import { clsx } from "clsx";
import { DragEvent, useEffect, useRef, useState } from "react";
import { Button, Col, Icon, LoadingCircle, Row, Text, Textarea } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { AgentConnectionConfig, ChatMessage, ChatRole, SendKeyMode } from "@types";
import {
  agentChat,
  ChatSession,
  loadCurrentMessages,
  saveCurrentMessages,
} from "@utils";
import { MessageBubbles } from "./MessageBubbles";
import { PendingAttachmentChips } from "./PendingAttachmentChips";
import {
  type AgentUiAction,
  deriveUiActions,
  formatSessionDate,
  sessionExcerpt,
} from "./agentChatHelpers";
import { ATTACH_ACCEPT, toChatAttachmentUpload } from "./chatAttachments";
import { useChatAttachments } from "./useChatAttachments";
import styles from "./AgentChatPanel.css";

export type { AgentUiAction } from "./agentChatHelpers";

export interface AgentChatPanelProps {
  transactions: Transaction[];
  onUiAction?: (action: AgentUiAction) => void;
  /** チャットの送信キー（設定画面で切替、AppPage が保持） */
  sendKeyMode: SendKeyMode;
  /** 送信時点の控除入力スナップショットを返す（エージェントの控除ツール用）。 */
  getDeductionsSnapshot?: () => { year: number; state: unknown } | null;
  /** 外部接続（AI）の上書き設定（設定画面で入力、AppPage が保持） */
  agentConnection: AgentConnectionConfig;
  /** 保存済みの過去の会話（履歴の状態は AppPage が保持し、見出し横のボタンと共有する） */
  sessions: ChatSession[];
  historyOpen: boolean;
  viewing: ChatSession | null;
  onSelectSession: (session: ChatSession) => void;
  /** クリア時に現在の会話を履歴へ保存する。 */
  onArchive: (messages: ChatMessage[]) => void;
  /**
   * クリア操作をヘッダー側（履歴ボタンの隣）へ渡す。
   * クリアできる状態のときだけハンドラを渡し、それ以外は null を渡す。
   */
  onClearReady?: (handler: (() => void) | null) => void;
}

// 送信キーの修飾キー表示。Mac は ⌘、それ以外（Windows 等）は Ctrl。
const MOD_KEY_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "")
    ? "⌘"
    : "Ctrl";

export const AgentChatPanel = ({
  transactions,
  onUiAction,
  sendKeyMode,
  getDeductionsSnapshot,
  agentConnection,
  sessions,
  historyOpen,
  viewing,
  onSelectSession,
  onArchive,
  onClearReady,
}: AgentChatPanelProps) => {
  // 会話は端末に保存し、再読み込みしても続きから使えるようにする。
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadCurrentMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pending, addFiles, removeFile, clear: clearFiles } = useChatAttachments(setError);
  const inHistory = historyOpen || viewing !== null;

  // 新しいメッセージが来たら会話ログを一番下までスクロールする（履歴閲覧時は先頭から）。
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = viewing ? 0 : el.scrollHeight;
  }, [messages, loading, viewing, historyOpen]);

  const send = async () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || loading) return;
    // 添付だけの送信もできるよう、本文が空なら定型文を入れる。
    const sent = pending;
    const userMessage: ChatMessage = {
      role: ChatRole.User,
      content: text || "添付ファイルを確認してください。",
      ...(sent.length > 0
        ? { attachments: sent.map(({ name, mimeType }) => ({ name, mimeType })) }
        : {}),
    };
    const next: ChatMessage[] = [...messages, userMessage];
    setMessages(next);
    saveCurrentMessages(next);
    setInput("");
    clearFiles();
    setLoading(true);
    setError(null);
    try {
      const res = await agentChat(
        next,
        transactions,
        agentConnection,
        getDeductionsSnapshot?.() ?? undefined,
        sent.map(toChatAttachmentUpload),
      );
      // 使ったツールは発言に添えて表示する（何をしたか分かるように）。
      const answered: ChatMessage[] = [
        ...next,
        {
          role: ChatRole.Assistant,
          content: res.reply,
          ...(res.toolCalls.length > 0
            ? {
                toolCalls: res.toolCalls.map((tc) => ({
                  name: tc.name,
                  arguments: tc.arguments,
                })),
              }
            : {}),
        },
      ];
      setMessages(answered);
      saveCurrentMessages(answered);
      if (res.toolCalls.length > 0) {
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

  // クリアボタンはヘッダー（履歴の隣）に置くため、押せる状態だけハンドラを渡す。
  useEffect(() => {
    onClearReady?.(!inHistory && messages.length > 0 && !loading ? clearChat : null);
    // clearChat は毎レンダーで作り直されるが、状態が変わったときだけ親へ伝えれば足りる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, inHistory, loading, onClearReady]);

  // ファイルのドラッグ&ドロップ受け口（履歴閲覧中は無効）。
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!inHistory) setDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (!inHistory) void addFiles(e.dataTransfer.files);
  };
  return (
    <div className={styles.root} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {dragging && !inHistory ? (
        <div className={styles.dropOverlay}>
          <Text variant="sectionTitle">離してファイルを添付</Text>
          <Text variant="muted">画像（JPEG/PNG/WebP/GIF）・PDF・CSV に対応しています</Text>
        </div>
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
            {sessions.length === 0 ? (
              <Text variant="muted">保存済みの会話はまだありません。</Text>
            ) : null}
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
            {messages.length === 0 && !loading ? (
              <Text variant="muted">
                質問や、集計・計算などの処理を頼めます。設定の変更もできます。例:
                「2024年の所得を集計して」「2024年の消費税を3方式で比べて」
                「ファミリーマートの支出はどのくらい？」「ＣａＳｙの科目を雑費に変えて」
                「『よどばし』を消耗品費にする分類ルールを追加して」
              </Text>
            ) : null}
            {messages.length === 0 && !loading ? (
              <Text variant="muted">
                ※ このAIエージェントは税制の一般的な説明と、帳簿の集計・計算・操作の代行を行います。
                個別の取引が経費にできるか等の税務判断は行いません。個別の判断が必要な場合は税理士へご相談ください。
              </Text>
            ) : null}
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
          <PendingAttachmentChips pending={pending} onRemove={removeFile} />
          <Row gap="sm" align="end" className={styles.inputRow}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ATTACH_ACCEPT}
              className={styles.hiddenFileInput}
              onChange={(e) => {
                void addFiles(e.target.files ?? []);
                e.target.value = "";
              }}
            />
            <Button
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              aria-label="ファイルを添付"
            >
              <Icon name="paperclip" size={16} />
            </Button>
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
            <Button onClick={() => void send()} disabled={loading} disabledReason="応答中です">
              送信
            </Button>
          </Row>
        </>
      )}
    </div>
  );
};