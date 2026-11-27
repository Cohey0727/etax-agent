/**
 * unauthorizedHandler.test.ts — API が 401（ログイン切れ）を返したときの扱いの検証。
 *
 * 担保すること:
 * - 取得系（失敗を null で返すもの）でも、401 は登録した処理へ知らせる
 *   （「DB未接続」と同じ扱いで黙らせない）
 * - 例外で返す API でも 401 を知らせ、呼び出し元には status 付きの ApiError を返す
 * - 401 以外の失敗では知らせない
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  ApiError,
  fetchApiKeys,
  fetchReceipts,
  setUnauthorizedHandler,
} from "../src/utils/api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  setUnauthorizedHandler(null);
});

const respondWith = (status: number) => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "ログインしていません" }), { status })) as unknown as typeof fetch;
};

describe("401 の通知", () => {
  test("取得系が 401 を受けたら null を返し、登録した処理へ知らせる", async () => {
    let notified = 0;
    setUnauthorizedHandler(() => {
      notified += 1;
    });
    respondWith(401);
    expect(await fetchReceipts()).toBeNull();
    expect(notified).toBe(1);
  });

  test("例外で返す API も 401 を知らせ、status 付きの ApiError を投げる", async () => {
    let notified = 0;
    setUnauthorizedHandler(() => {
      notified += 1;
    });
    respondWith(401);
    const error = await fetchApiKeys().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(notified).toBe(1);
  });

  test("401 以外の失敗では知らせない", async () => {
    let notified = 0;
    setUnauthorizedHandler(() => {
      notified += 1;
    });
    respondWith(503);
    expect(await fetchReceipts()).toBeNull();
    expect(notified).toBe(0);
  });
});
