import { beforeEach, describe, expect, mock, test } from "bun:test";

const secureStore = new Map<string, string>();
mock.module("expo-secure-store", () => ({
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStore.delete(key);
  },
}));

const { bootstrapAuth } = await import("../src/auth/bootstrapAuth");
const { ApiError } = await import("../src/api/client");
const { saveSessionToken, currentSessionToken } = await import("../src/api/session");

const CONFIG = { required: true, methods: { password: true, magic_link: false, google: false, github: false } };
const USER = { id: 7, email: "a@example.com", totp_enabled: false };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** /api/auth/config は成功させ、/api/auth/me だけ指定の応答にする。 */
function serveMe(me: () => Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/auth/config")) return json(200, CONFIG);
    if (url.endsWith("/api/auth/me")) return me();
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
}

describe("bootstrapAuth", () => {
  beforeEach(async () => {
    await saveSessionToken("saved-token");
  });

  test("通信できないときは例外にし、保存済みトークンを残す", async () => {
    serveMe(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(bootstrapAuth()).rejects.toBeInstanceOf(ApiError);
    expect(currentSessionToken()).toBe("saved-token");
    expect(secureStore.get("etax.session.token")).toBe("saved-token");
  });

  test("サーバーが 503 を返したときは例外にし、保存済みトークンを残す", async () => {
    serveMe(async () => json(503, { error: "データベースが設定されていません" }));
    await expect(bootstrapAuth()).rejects.toMatchObject({ status: 503 });
    expect(currentSessionToken()).toBe("saved-token");
  });

  test("401（失効）のときだけ保存済みトークンを消す", async () => {
    serveMe(async () => json(401, { error: "ログインしていません" }));
    const result = await bootstrapAuth();
    expect(result).toEqual({ config: CONFIG, user: null });
    expect(currentSessionToken()).toBeNull();
    expect(secureStore.has("etax.session.token")).toBe(false);
  });

  test("ログイン中ならユーザーを返す", async () => {
    serveMe(async () => json(200, { user: USER }));
    expect(await bootstrapAuth()).toEqual({ config: CONFIG, user: USER });
    expect(currentSessionToken()).toBe("saved-token");
  });
});
