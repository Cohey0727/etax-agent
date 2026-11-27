/**
 * agentChatAbort.test.ts — エージェントへの送信を途中でやめられることの検証。
 *
 * 担保すること:
 * - 応答待ちの送信は、渡した AbortSignal で中断でき、待ち続けない
 */
import { afterEach, describe, expect, test } from "bun:test";
import { agentChat } from "../src/utils/api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("agentChat の中断", () => {
  test("応答が返らなくても、中断すれば待ちが終わる", async () => {
    // 応答を返さず、中断されたときだけ失敗するサーバー
    globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const controller = new AbortController();
    const pending = agentChat([], [], undefined, undefined, undefined, controller.signal);
    controller.abort("user");
    await expect(pending).rejects.toBe("user");
  });
});
