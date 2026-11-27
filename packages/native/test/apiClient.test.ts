import { json, stubFetch } from "./nativeMocks";
import { beforeEach, describe, expect, test } from "bun:test";

const { apiJson, apiJsonOrNull, ApiError } = await import("../src/api/client");
const { currentSessionToken, saveSessionToken, subscribeSessionToken } = await import("../src/api/session");

describe("apiRaw の期限", () => {
  test("期限までに応答が無ければ ApiError(0) で打ち切る", async () => {
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    const error = await apiJson("/api/health", { timeoutMs: 20 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, message: "サーバーからの応答がありませんでした" });
  });

  test("通信できないときは接続できない旨の ApiError(0)", async () => {
    stubFetch(() => {
      throw new TypeError("Network request failed");
    });
    await expect(apiJson("/api/health")).rejects.toMatchObject({
      status: 0,
      message: "ネットワークに接続できませんでした",
    });
  });
});

describe("セッションの失効（401）", () => {
  beforeEach(async () => {
    await saveSessionToken("token-a");
  });

  test("送ったトークンが 401 で拒否されたら、トークンを消して購読者へ知らせる", async () => {
    const notified: (string | null)[] = [];
    const unsubscribe = subscribeSessionToken((token) => notified.push(token));
    stubFetch(() => json(401, { message: "ログインが必要です" }));
    expect(await apiJsonOrNull("/api/transactions")).toBeNull();
    unsubscribe();
    expect(currentSessionToken()).toBeNull();
    expect(notified).toEqual([null]);
  });

  test("トークンを送らない呼び出し（ログイン等）の 401 ではトークンを消さない", async () => {
    stubFetch(() => json(401, { error: "メールアドレスまたはパスワードが違います" }));
    await expect(apiJson("/api/auth/login", { method: "POST", body: {}, anonymous: true })).rejects.toMatchObject({
      status: 401,
    });
    expect(currentSessionToken()).toBe("token-a");
  });

  test("応答を待つ間にトークンが替わっていたら、新しいトークンは消さない", async () => {
    stubFetch(async () => {
      await saveSessionToken("token-b");
      return json(401, { message: "ログインが必要です" });
    });
    await apiJsonOrNull("/api/transactions");
    expect(currentSessionToken()).toBe("token-b");
  });
});
