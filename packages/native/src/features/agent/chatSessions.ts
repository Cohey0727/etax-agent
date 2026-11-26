import AsyncStorage from "@react-native-async-storage/async-storage";
import { ChatMessage } from "@/api";

/** 保存済みの会話セッション（履歴から再開できる）。 */
export interface ChatSession {
  id: string;
  savedAt: string;
  messages: ChatMessage[];
}

function currentKey(userId: number | null): string {
  return `etax.agent.current-messages-${userId ?? "anon"}`;
}

function sessionsKey(userId: number | null): string {
  return `etax.agent.sessions-${userId ?? "anon"}`;
}

function parseMessages(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ChatMessage =>
        typeof m === "object" &&
        m !== null &&
        ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
        typeof (m as ChatMessage).content === "string",
    );
  } catch {
    return [];
  }
}

export async function loadCurrentMessages(userId: number | null): Promise<ChatMessage[]> {
  return parseMessages(await AsyncStorage.getItem(currentKey(userId)).catch(() => null));
}

export function saveCurrentMessages(userId: number | null, messages: ChatMessage[]): void {
  AsyncStorage.setItem(currentKey(userId), JSON.stringify(messages)).catch(() => undefined);
}

export async function loadSessions(userId: number | null): Promise<ChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(sessionsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is ChatSession =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as ChatSession).id === "string" &&
        Array.isArray((s as ChatSession).messages),
    );
  } catch {
    return [];
  }
}

export function saveSessions(userId: number | null, sessions: ChatSession[]): void {
  AsyncStorage.setItem(sessionsKey(userId), JSON.stringify(sessions)).catch(() => undefined);
}

/** 履歴一覧の日付表示。 */
export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${date.getFullYear()}/${m}/${d} ${hh}:${mm}`;
}

/** 履歴一覧に出す会話の要約（最初のユーザー発言）。 */
export function sessionExcerpt(session: ChatSession): string {
  const first = session.messages.find((m) => m.role === "user");
  const text = first?.content ?? session.messages[0]?.content ?? "";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
