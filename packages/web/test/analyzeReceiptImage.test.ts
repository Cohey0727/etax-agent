/**
 * analyzeReceiptImage.test.ts — 領収書画像の解析経路の検証。
 *
 * 担保すること:
 * - 受け口URLが使えない（ストレージ未設定で presign が失敗する）ときだけ Base64 で解析する
 * - アップロード後の解析が失敗したら、同じ画像を解析し直さずにサーバーのエラーを返す
 */
import { afterEach, describe, expect, test } from "bun:test";
import { analyzeReceiptImage } from "../src/utils/api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const analyzed = {
  date: "2026-11-20",
  amount: 1100,
  payee: "文具店",
  description: "ボールペン",
  classification: { account: "消耗品費", confidence: null, source: "rules", candidates: [] },
};

const recordCalls = (respond: (url: string, init?: RequestInit) => Response): string[] => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push(body && "imageBase64" in body ? `${url} (base64)` : url);
    return respond(url, init);
  }) as typeof fetch;
  return calls;
};

const image = () => new File([new Uint8Array([1, 2, 3])], "receipt.png", { type: "image/png" });

describe("analyzeReceiptImage", () => {
  test("アップロード後の解析が失敗したら、Base64 で解析し直さずにエラーを返す", async () => {
    const calls = recordCalls((url) => {
      if (url === "/api/files/presign-upload") {
        return json(200, { fileId: "file-1", uploadUrl: "https://storage.example/upload", expiresInSeconds: 600 });
      }
      if (url === "https://storage.example/upload") return new Response(null, { status: 200 });
      return json(503, { error: "AIの接続が設定されていません" });
    });
    await expect(analyzeReceiptImage(image())).rejects.toThrow("AIの接続が設定されていません");
    expect(calls).toEqual([
      "/api/files/presign-upload",
      "https://storage.example/upload",
      "/api/receipts/analyze",
    ]);
  });

  test("受け口URLが使えないときは Base64 で解析する", async () => {
    const calls = recordCalls((url) =>
      url === "/api/files/presign-upload"
        ? json(503, { error: "ストレージが設定されていません" })
        : json(200, analyzed),
    );
    const result = await analyzeReceiptImage(image());
    expect(calls).toEqual(["/api/files/presign-upload", "/api/receipts/analyze (base64)"]);
    expect(result).toEqual({ result: analyzed, fileId: null });
  });

  test("受け口URL経由の解析は証憑の fileId を返す", async () => {
    recordCalls((url) => {
      if (url === "/api/files/presign-upload") {
        return json(200, { fileId: "file-1", uploadUrl: "https://storage.example/upload", expiresInSeconds: 600 });
      }
      if (url === "https://storage.example/upload") return new Response(null, { status: 200 });
      return json(200, analyzed);
    });
    expect(await analyzeReceiptImage(image())).toEqual({ result: analyzed, fileId: "file-1" });
  });
});
