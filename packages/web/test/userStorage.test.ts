/**
 * userStorage.test.ts — 端末保存のユーザー分離と APIキーの
 * セッション保存の検証（Issue #9）。
 */
import { beforeEach, describe, expect, test } from "bun:test";

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const local = new MemoryStorage();
const session = new MemoryStorage();
(globalThis as Record<string, unknown>).localStorage = local;
(globalThis as Record<string, unknown>).sessionStorage = session;

const { setStorageUserId, userScopedKey, clearCurrentUserStorage } = await import(
  "../src/utils/userStorage"
);
const { loadAgentConnection, saveAgentConnection, clearStoredAgentApiKey } = await import(
  "../src/utils/agentConnection"
);
const { loadCurrentMessages, saveCurrentMessages } = await import("../src/utils/chatStorage");
const { ChatRole } = await import("../src/types");

beforeEach(() => {
  local.clear();
  session.clear();
  setStorageUserId(null);
});

describe("userScopedKey とログアウト時のクリア", () => {
  test("ユーザーIDで名前空間化され、別ユーザーの値と混ざらない", () => {
    setStorageUserId(3);
    expect(userScopedKey("etax-agent-chat-current")).toBe("etax-agent-chat-current:u3");
    saveCurrentMessages([{ role: ChatRole.User, content: "Aの会話" } as never]);
    setStorageUserId(4);
    expect(loadCurrentMessages()).toEqual([]);
    saveCurrentMessages([{ role: ChatRole.User, content: "Bの会話" } as never]);
    setStorageUserId(3);
    expect(loadCurrentMessages()[0]?.content).toBe("Aの会話");
  });

  test("ログアウト時はそのユーザーのキーだけ消える", () => {
    setStorageUserId(3);
    saveCurrentMessages([{ role: ChatRole.User, content: "Aの会話" } as never]);
    local.setItem("etax-agent-theme", "dark");
    setStorageUserId(4);
    saveCurrentMessages([{ role: ChatRole.User, content: "Bの会話" } as never]);
    setStorageUserId(3);
    clearCurrentUserStorage();
    expect(loadCurrentMessages()).toEqual([]);
    expect(local.getItem("etax-agent-theme")).toBe("dark");
    setStorageUserId(4);
    expect(loadCurrentMessages()[0]?.content).toBe("Bの会話");
  });

  test("ユーザー未確定（ローカル運用）では従来キーを使う", () => {
    expect(userScopedKey("etax-agent-chat-current")).toBe("etax-agent-chat-current");
  });
});

describe("APIキーの保存先", () => {
  test("キーは localStorage に残らず sessionStorage にだけ入る", () => {
    saveAgentConnection({ baseUrl: "http://localhost:11434", model: "m1", apiKey: "sk-secret" });
    const persisted = local.getItem("etax-agent-connection") ?? "";
    expect(persisted).not.toContain("sk-secret");
    expect(JSON.parse(persisted)).toEqual({ baseUrl: "http://localhost:11434", model: "m1" });
    expect(loadAgentConnection()).toEqual({
      baseUrl: "http://localhost:11434",
      model: "m1",
      apiKey: "sk-secret",
    });
    clearStoredAgentApiKey();
    expect(loadAgentConnection().apiKey).toBe("");
  });

  test("旧形式（localStorage にキー入り）は読み込み時に移行して消す", () => {
    local.setItem(
      "etax-agent-connection",
      JSON.stringify({ baseUrl: "https://example.com", model: "m2", apiKey: "sk-old" }),
    );
    expect(loadAgentConnection().apiKey).toBe("sk-old");
    expect(local.getItem("etax-agent-connection") ?? "").not.toContain("sk-old");
    expect(session.getItem("etax-agent-connection-key")).toBe("sk-old");
  });
});
