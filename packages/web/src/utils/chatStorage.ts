import { ChatMessage, ChatRole } from "@types";
import { userScopedKey } from "./userStorage";

/** 保存された過去の会話（クリア時にアーカイブされる）。 */
export interface ChatSession {
  id: string;
  /** 保存日時（ISO文字列） */
  savedAt: string;
  messages: ChatMessage[];
}

const CURRENT_KEY = "etax-agent-chat-current";
const SESSIONS_KEY = "etax-agent-chat-sessions";
// 履歴の保持上限。古いものから落とす（ブラウザ保存容量の節約）。
const MAX_SESSIONS = 50;

const parseMessages = (raw: string | null): ChatMessage[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ChatMessage =>
        typeof m === "object" &&
        m !== null &&
        (m as ChatMessage).role !== undefined &&
        ((m as ChatMessage).role === ChatRole.User ||
          (m as ChatMessage).role === ChatRole.Assistant) &&
        typeof (m as ChatMessage).content === "string",
    );
  } catch {
    return [];
  }
};

/** 進行中の会話（再読み込みしても残るよう随時保存する）。 */
export const loadCurrentMessages = (): ChatMessage[] => {
  try {
    return parseMessages(localStorage.getItem(userScopedKey(CURRENT_KEY)));
  } catch {
    return [];
  }
};

export const saveCurrentMessages = (messages: ChatMessage[]): void => {
  try {
    localStorage.setItem(userScopedKey(CURRENT_KEY), JSON.stringify(messages));
  } catch {
    // 保存できなくても会話自体は続けられる
  }
};

/** アーカイブ済みの過去の会話一覧（新しい順）。 */
export const loadChatSessions = (): ChatSession[] => {
  try {
    const raw = localStorage.getItem(userScopedKey(SESSIONS_KEY));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s): s is { id: string; savedAt: string; messages: unknown } =>
          typeof s === "object" && s !== null &&
          typeof (s as ChatSession).id === "string" &&
          typeof (s as ChatSession).savedAt === "string",
      )
      .map((s) => ({ id: s.id, savedAt: s.savedAt, messages: parseMessages(JSON.stringify(s.messages)) }))
      .filter((s) => s.messages.length > 0);
  } catch {
    return [];
  }
};

const saveChatSessions = (sessions: ChatSession[]): void => {
  try {
    localStorage.setItem(userScopedKey(SESSIONS_KEY), JSON.stringify(sessions));
  } catch {
    // 保存できなくても会話自体は続けられる
  }
};

/** 現在の会話を履歴へアーカイブし、新しい一覧を返す。 */
export const archiveChatSession = (messages: ChatMessage[]): ChatSession[] => {
  if (messages.length === 0) return loadChatSessions();
  const session: ChatSession = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    messages,
  };
  const next = [session, ...loadChatSessions()].slice(0, MAX_SESSIONS);
  saveChatSessions(next);
  return next;
};
