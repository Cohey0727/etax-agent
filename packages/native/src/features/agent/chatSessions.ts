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
