import { json, stubFetch } from "./nativeMocks";
import { describe, expect, test } from "bun:test";

const { apiJson, ApiError } = await import("../src/api/client");

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
