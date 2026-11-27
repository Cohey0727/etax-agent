import { json, localFiles, stubFetch } from "./nativeMocks";
import { describe, expect, test } from "bun:test";

const { analyzeReceiptImage } = await import("../src/api/receipts");
const { API_URL } = await import("../src/config/env");

const IMAGE_URI = "file:///receipt.jpg";
localFiles.set(IMAGE_URI, new Uint8Array([0xff, 0xd8, 0xff]));

const DRAFT = {
  date: "2025-04-01",
  amount: 1200,
  payee: "喫茶店",
  description: "打ち合わせ",
  classification: { account: "会議費", source: "rules", confidence: null, candidates: [] },
};

const PRESIGN = { fileId: "f-123", uploadUrl: "/api/files/upload/f-123" };

function analyzeCalls(calls: { url: string }[]) {
  return calls.filter((c) => c.url === `${API_URL}/api/receipts/analyze`);
}

describe("analyzeReceiptImage", () => {
  test("アップロードと解析が成功したら fileId を返す", async () => {
    const calls = stubFetch(({ url }) => {
      if (url.endsWith("/api/files/presign-upload")) return json(200, PRESIGN);
      if (url.endsWith("/api/files/upload/f-123")) return new Response(null, { status: 200 });
      return json(200, DRAFT);
    });
    const analyzed = await analyzeReceiptImage(IMAGE_URI, "image/jpeg");
    expect(analyzed).toEqual({ result: DRAFT, fileId: "f-123" });
    expect(analyzeCalls(calls).map((c) => c.body)).toEqual([{ fileId: "f-123" }]);
  });

  test("fileId での解析が失敗したら、Base64 で解析し直さずにそのエラーを返す", async () => {
    const calls = stubFetch(({ url }) => {
      if (url.endsWith("/api/files/presign-upload")) return json(200, PRESIGN);
      if (url.endsWith("/api/files/upload/f-123")) return new Response(null, { status: 200 });
      return json(503, { error: "領収書を読み取れませんでした" });
    });
    await expect(analyzeReceiptImage(IMAGE_URI, "image/jpeg")).rejects.toMatchObject({
      status: 503,
      message: "領収書を読み取れませんでした",
    });
    expect(analyzeCalls(calls)).toHaveLength(1);
  });

  test("署名付きURLを発行できないときは Base64 で解析し、fileId は null", async () => {
    const calls = stubFetch(({ url }) => {
      if (url.endsWith("/api/files/presign-upload")) return json(503, { error: "ストレージが設定されていません" });
      return json(200, DRAFT);
    });
    const analyzed = await analyzeReceiptImage(IMAGE_URI, "image/jpeg");
    expect(analyzed).toEqual({ result: DRAFT, fileId: null });
    expect(analyzeCalls(calls).map((c) => c.body)).toEqual([{ imageBase64: "/9j/", mimeType: "image/jpeg" }]);
  });

  test("アップロード（PUT）が失敗したときも Base64 で解析する", async () => {
    const calls = stubFetch(({ url }) => {
      if (url.endsWith("/api/files/presign-upload")) return json(200, PRESIGN);
      if (url.endsWith("/api/files/upload/f-123")) return new Response(null, { status: 500 });
      return json(200, DRAFT);
    });
    const analyzed = await analyzeReceiptImage(IMAGE_URI, "image/jpeg");
    expect(analyzed.fileId).toBeNull();
    expect(analyzeCalls(calls)).toHaveLength(1);
  });
});
