import { clsx } from "clsx";
import { DragEvent, useEffect, useRef, useState } from "react";
import { Button, Col, Icon, LoadingCircle, Row, Text, Textarea } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { ChatMessage, ChatRole, SendKeyMode } from "@types";
import { ChatSession, formatDateTime } from "@utils";
import { MessageBubbles } from "./MessageBubbles";
import { PendingAttachmentChips } from "./PendingAttachmentChips";
import { sessionExcerpt } from "./agentChatHelpers";
import { ATTACH_ACCEPT, PendingAttachment } from "./chatAttachments";
import { useChatAttachments } from "../hooks/useChatAttachments";
import styles from "./AgentChatPanel.css";

export interface AgentChatPanelProps {
  /** 進行中の会話（AppPage が useAgentConversation で持つ）。 */
  messages: ChatMessage[];
  /** 応答待ちか。 */
  loading: boolean;
  /** 送信の失敗・中断の案内。 */
  error: string | null;
  onSend: (text: string, attachments: PendingAttachment[]) => void;
  /** 応答待ちをやめる。 */
  onStop: () => void;
  /** チャットの送信キー（設定画面で切替、AppPage が保持） */
  sendKeyMode: SendKeyMode;
  /** 保存済みの過去の会話（履歴の状態は AppPage が保持し、見出し横のボタンと共有する） */
  sessions: ChatSession[];
  historyOpen: boolean;
  viewing: ChatSession | null;
  onSelectSession: (session: ChatSession) => void;
}

// 送信キーの修飾キー表示。Mac は ⌘、それ以外（Windows 等）は Ctrl。
const MOD_KEY_LABEL =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "")
    ? "⌘"
    : "Ctrl";

export const AgentChatPanel = ({
  messages,
  loading,
  error,
  onSend,
  onStop,
  sendKeyMode,
  sessions,
  historyOpen,
  viewing,
  onSelectSession,
}: AgentChatPanelProps) => {
  const [input, setInput] = useState("");
  // 添付の読み込み・検証の失敗（送信の失敗は error で受け取る）。
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { pending, addFiles, removeFile, clear: clearFiles } = useChatAttachments(setAttachError);
  const inHistory = historyOpen || viewing !== null;

  // 新しいメッセージが来たら会話ログを一番下までスクロールする（履歴閲覧時は先頭から）。
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = viewing ? 0 : el.scrollHeight;
  }, [messages, loading, viewing, historyOpen]);

  const send = () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || loading) return;
    onSend(text, pending);
    setInput("");
    clearFiles();
    setAttachError(null);
  };

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
            {formatDateTime(viewing.savedAt)} の会話（保存済み・{viewing.messages.length}件）
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
                    {formatDateTime(session.savedAt)} ・ {session.messages.length}件
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
          {(attachError ?? error) && <AlertBox variant="error">{attachError ?? error}</AlertBox>}
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
              disabledReason="応答中です"
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
                  send();
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
            {loading ? (
              <Button variant="ghost" onClick={onStop}>
                中断
              </Button>
            ) : (
              <Button onClick={send}>送信</Button>
            )}
          </Row>
        </>
      )}
    </div>
  );
};