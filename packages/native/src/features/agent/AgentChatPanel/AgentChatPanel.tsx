import { Transaction } from "@etax/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { AgentConnectionConfig, ChatMessage, agentChat } from "@/api";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { BouncePressable } from "@/components/BouncePressable";
import { Chip } from "@/components/Chip";
import { LineIcon } from "@/components/LineIcon";
import { SorobanMark } from "@/components/SorobanMark";
import { colors, radius, space } from "@/theme";
import { AgentUiAction, deriveUiActions } from "../agentChatHelpers";
import {
  MAX_CHAT_ATTACHMENTS,
  PendingAttachment,
  pickDocumentAttachments,
  pickImageAttachments,
  toChatAttachmentUpload,
} from "../chatAttachments";
import {
  ChatSession,
  formatSessionDate,
  loadCurrentMessages,
  loadSessions,
  saveCurrentMessages,
  saveSessions,
  sessionExcerpt,
} from "../chatSessions";
import { MessageBubbles } from "../MessageBubbles";

export interface AgentChatPanelProps {
  userId: number | null;
  transactions: Transaction[];
  connection: AgentConnectionConfig;
  getDeductionsSnapshot: () => Promise<{ year: number; state: unknown } | null>;
  onUiAction: (action: AgentUiAction) => void;
}

type ViewMode = "chat" | "history" | "session";

/** AIエージェントのチャット（履歴の保存・復元、添付、UIアクション適用つき）。 */
export function AgentChatPanel({
  userId,
  transactions,
  connection,
  getDeductionsSnapshot,
  onUiAction,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [viewing, setViewing] = useState<ChatSession | null>(null);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollView, setScrollView] = useState<{ scrollToEnd: (options?: { animated?: boolean }) => void } | null>(null);

  useEffect(() => {
    void (async () => {
      setMessages(await loadCurrentMessages(userId));
      setSessions(await loadSessions(userId));
    })();
  }, [userId]);

  const addAttachments = async (picker: () => Promise<PendingAttachment[]>) => {
    setError(null);
    try {
      const picked = await picker();
      setPending((prev) => [...prev, ...picked].slice(0, MAX_CHAT_ATTACHMENTS));
    } catch (e) {
      setError(e instanceof Error ? e.message : "添付に失敗しました");
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || loading) return;
    const sent = pending;
    const userMessage: ChatMessage = {
      role: "user",
      content: text || "添付ファイルを確認してください。",
      ...(sent.length > 0
        ? { attachments: sent.map(({ name, mimeType }) => ({ name, mimeType })) }
        : {}),
    };
    const next = [...messages, userMessage];
    setMessages(next);
    saveCurrentMessages(userId, next);
    setInput("");
    setPending([]);
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDeductionsSnapshot();
      const res = await agentChat(
        next,
        transactions,
        connection,
        snapshot ?? undefined,
        sent.map(toChatAttachmentUpload),
      );
      if (res.error) setError(res.error);
      const answered: ChatMessage[] = [
        ...next,
        {
          role: "assistant",
          content: res.reply,
          ...(res.toolCalls.length > 0
            ? { toolCalls: res.toolCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments })) }
            : {}),
        },
      ];
      setMessages(answered);
      saveCurrentMessages(userId, answered);
      if (res.toolCalls.length > 0) {
        deriveUiActions(res.toolCalls).forEach(onUiAction);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  // クリア = いまの会話を履歴へ保存してから空にする
  const clearChat = () => {
    if (messages.length === 0) return;
    const session: ChatSession = {
      id: `session-${Date.now()}`,
      savedAt: new Date().toISOString(),
      messages,
    };
    const nextSessions = [session, ...sessions];
    setSessions(nextSessions);
    saveSessions(userId, nextSessions);
    setMessages([]);
    saveCurrentMessages(userId, []);
  };

  const resumeSession = (session: ChatSession) => {
    setMessages(session.messages);
    saveCurrentMessages(userId, session.messages);
    const nextSessions = sessions.filter((s) => s.id !== session.id);
    setSessions(nextSessions);
    saveSessions(userId, nextSessions);
    setViewing(null);
    setViewMode("chat");
  };

  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <AppButton
          label="履歴"
          variant="ghost"
          size="sm"
          onPress={() => setViewMode(viewMode === "history" ? "chat" : "history")}
        />
        {viewMode === "chat" && messages.length > 0 && !loading ? (
          <AppButton label="クリア（履歴へ保存）" variant="ghost" size="sm" onPress={clearChat} />
        ) : null}
        {viewMode !== "chat" ? (
          <AppButton
            label="会話に戻る"
            variant="ghost"
            size="sm"
            onPress={() => {
              setViewMode("chat");
              setViewing(null);
            }}
          />
        ) : null}
      </View>

      {viewMode === "history" ? (
        <ScrollView contentContainerStyle={styles.logContent}>
          {sessions.length === 0 ? (
            <AppText size="sm" tone="muted">
              保存済みの会話はまだありません。
            </AppText>
          ) : (
            sessions.map((session) => (
              <BouncePressable
                key={session.id}
                accessibilityRole="button"
                onPress={() => {
                  setViewing(session);
                  setViewMode("session");
                }}
                style={styles.sessionItem}
              >
                <AppText size="xs" tone="muted">
                  {formatSessionDate(session.savedAt)} ・ {session.messages.length}件
                </AppText>
                <AppText size="md">{sessionExcerpt(session)}</AppText>
              </BouncePressable>
            ))
          )}
        </ScrollView>
      ) : viewMode === "session" && viewing ? (
        <ScrollView contentContainerStyle={styles.logContent}>
          <AppText size="sm" tone="muted">
            {formatSessionDate(viewing.savedAt)} の会話（保存済み・{viewing.messages.length}件）
          </AppText>
          <MessageBubbles items={viewing.messages} />
          <AppButton label="この会話を再開" size="sm" onPress={() => resumeSession(viewing)} />
        </ScrollView>
      ) : (
        <>
          {messages.length === 0 && !loading ? (
            <View style={styles.empty}>
              <SorobanMark width={44} />
              <AppText size="sm" tone="muted">
                帳簿のことを、何でも聞いてください
              </AppText>
            </View>
          ) : (
            <ScrollView
              ref={setScrollView}
              contentContainerStyle={styles.logContent}
              onContentSizeChange={() => scrollView?.scrollToEnd({ animated: true })}
            >
              <MessageBubbles items={messages} />
              {loading ? (
                <View style={styles.thinking}>
                  <ActivityIndicator color={colors.accent} />
                  <AppText size="sm" tone="muted">
                    考え中…
                  </AppText>
                </View>
              ) : null}
            </ScrollView>
          )}
          {error ? <AlertBox tone="error" message={error} /> : null}
          {pending.length > 0 ? (
            <View style={styles.chips}>
              {pending.map((att) => (
                <BouncePressable
                  key={att.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${att.name} を取り除く`}
                  onPress={() => setPending(pending.filter((p) => p.id !== att.id))}
                >
                  <Chip label={`${att.name} ×`} tone="accent" />
                </BouncePressable>
              ))}
            </View>
          ) : null}
          <View style={styles.composer}>
            <BouncePressable
              accessibilityRole="button"
              accessibilityLabel="画像を添付"
              disabled={loading}
              onPress={() => void addAttachments(pickImageAttachments)}
              style={styles.attachButton}
              pressScale={0.9}
            >
              <LineIcon name="image" size={20} color={colors.muted} />
            </BouncePressable>
            <BouncePressable
              accessibilityRole="button"
              accessibilityLabel="ファイル（PDF/CSV）を添付"
              disabled={loading}
              onPress={() => void addAttachments(pickDocumentAttachments)}
              style={styles.attachButton}
              pressScale={0.9}
            >
              <LineIcon name="file" size={20} color={colors.muted} />
            </BouncePressable>
            <TextInput
              accessibilityLabel="メッセージ"
              multiline
              onChangeText={setInput}
              placeholder="エージェントへの依頼を入力"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={input}
            />
            <BouncePressable
              accessibilityRole="button"
              accessibilityLabel="送信"
              disabled={input.trim() === "" && pending.length === 0}
              onPress={() => void send()}
              style={[
                styles.sendButton,
                input.trim() === "" && pending.length === 0 ? styles.sendButtonDisabled : null,
              ]}
              pressScale={0.9}
            >
              <LineIcon name="send" size={18} color={colors.onAccent} />
            </BouncePressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space.md, gap: space.sm },
  headerRow: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
  logContent: { gap: space.sm, paddingBottom: space.md },
  sessionItem: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: space.sm, gap: 2 },
  thinking: { flexDirection: "row", alignItems: "center", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.xs,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    fontFamily: "IBMPlexSansJP-400",
    fontSize: 16,
    color: colors.text,
    maxHeight: 120,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { backgroundColor: colors.lavender },
});
