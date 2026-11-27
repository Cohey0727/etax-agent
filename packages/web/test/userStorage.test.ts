/**
 * userStorage.test.ts — 端末保存のユーザー分離と APIキーの
 * セッション保存の検証。
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
const { readExtraYears, readStoredYear, saveExtraYears, saveStoredYear } = await import(
  "../src/components/pages/AppPage/appPageStorage"
);
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

  test("ユーザー未確定（ローカル運用）では名前空間を付けないキーを使う", () => {
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

  test("localStorage にキーが入っていたら、読み込み時に sessionStorage へ移して消す", () => {
    local.setItem(
      "etax-agent-connection",
      JSON.stringify({ baseUrl: "https://example.com", model: "m2", apiKey: "sk-old" }),
    );
    expect(loadAgentConnection().apiKey).toBe("sk-old");
    expect(local.getItem("etax-agent-connection") ?? "").not.toContain("sk-old");
    expect(session.getItem("etax-agent-connection-key")).toBe("sk-old");
  });
});

describe("アカウントごとの表示設定", () => {
  test("外部接続の設定と年度は別のアカウントへ引き継がず、ログアウトで消える", () => {
    setStorageUserId(3);
    saveAgentConnection({ baseUrl: "https://a.example", model: "model-a", apiKey: "sk-a" });
    saveStoredYear(2024);
    saveExtraYears([2023]);

    setStorageUserId(4);
    expect(loadAgentConnection()).toEqual({ baseUrl: "", model: "", apiKey: "" });
    expect(readStoredYear()).toBe(0);
    expect(readExtraYears()).toEqual([]);

    setStorageUserId(3);
    expect(loadAgentConnection()).toEqual({
      baseUrl: "https://a.example",
      model: "model-a",
      apiKey: "sk-a",
    });
    expect(readStoredYear()).toBe(2024);
    clearCurrentUserStorage();
    clearStoredAgentApiKey();
    expect(loadAgentConnection()).toEqual({ baseUrl: "", model: "", apiKey: "" });
    expect(readStoredYear()).toBe(0);
    expect(readExtraYears()).toEqual([]);
  });
});
