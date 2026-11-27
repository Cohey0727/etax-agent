/**
 * mailGateway.test.ts — メール送信（Resend の API）の接続点の検証。
 * 送信の成否を応答の検証まで含めて判定し、未設定なら送らないことを担保する。
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sendMail } from "../src/gateways/mailGateway";

const originalFetch = globalThis.fetch;
const originalKey = process.env.RESEND_API_KEY;
let calls: { url: string; body: unknown }[] = [];

function stubFetch(status: number, body: unknown): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "null")) });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

const mail = { to: "user@example.com", subject: "件名", text: "本文" };

beforeEach(() => {
  calls = [];
  process.env.RESEND_API_KEY = "re_test";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
});

describe("sendMail", () => {
  test("送信 ID が返れば成功", async () => {
    stubFetch(200, { id: "email_123" });
    expect(await sendMail(mail)).toBe(true);
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect(calls[0]?.body).toMatchObject({ to: ["user@example.com"], subject: "件名", text: "本文" });
  });

  test("応答の形が想定と違えば失敗として扱う", async () => {
    stubFetch(200, { unexpected: true });
    expect(await sendMail(mail)).toBe(false);
  });

  test("エラーのステータスなら失敗", async () => {
    stubFetch(422, { message: "invalid" });
    expect(await sendMail(mail)).toBe(false);
  });

  test("APIキーが未設定なら送らない", async () => {
    delete process.env.RESEND_API_KEY;
    stubFetch(200, { id: "email_123" });
    expect(await sendMail(mail)).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
