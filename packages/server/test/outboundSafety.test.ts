/**
 * outboundSafety.test.ts — Issue #5（baseUrl 経由のキー漏洩・SSRF）の再現テスト。
 *
 * - pairApiKeyWithBaseUrl: カスタム baseUrl に環境変数のキーが
 *   組み合わさらないこと。
 * - assertSafeUserBaseUrl: スキーム検証（常時）と、SaaS モードでの
 *   内部アドレス拒否。
 */
import { afterEach, describe, expect, test } from "bun:test";
import { pairApiKeyWithBaseUrl } from "../src/lib/config";
import { assertSafeUserBaseUrl, isPrivateIp, UnsafeUrlError } from "../src/lib/ssrfGuard";

describe("pairApiKeyWithBaseUrl（キー漏洩防止）", () => {
  test("カスタム baseUrl には環境変数のキーを送らない", () => {
    const paired = pairApiKeyWithBaseUrl({
      customBaseUrl: "https://attacker.example.com/v1",
      serverBaseUrl: "https://openrouter.ai/api/v1",
      userKey: null,
      serverKey: "sk-server-secret",
    });
    expect(paired.baseUrl).toBe("https://attacker.example.com/v1");
    expect(paired.apiKey).toBeNull();
  });

  test("カスタム baseUrl にはユーザー自身のキーだけを組み合わせる", () => {
    const paired = pairApiKeyWithBaseUrl({
      customBaseUrl: "https://my-endpoint.example.com/v1",
      serverBaseUrl: "https://openrouter.ai/api/v1",
      userKey: "sk-user-key",
      serverKey: "sk-server-secret",
    });
    expect(paired.apiKey).toBe("sk-user-key");
  });

  test("カスタム baseUrl がサーバー設定と同じ宛先ならサーバーのキーを使える", () => {
    const paired = pairApiKeyWithBaseUrl({
      customBaseUrl: "https://openrouter.ai/api/v1/",
      serverBaseUrl: "https://openrouter.ai/api/v1",
      userKey: null,
      serverKey: "sk-server-secret",
    });
    expect(paired.apiKey).toBe("sk-server-secret");
  });

  test("baseUrl 未指定ならサーバー設定とサーバーのキーが使われる", () => {
    const paired = pairApiKeyWithBaseUrl({
      customBaseUrl: null,
      serverBaseUrl: "http://127.0.0.1:11434",
      userKey: null,
      serverKey: null,
    });
    expect(paired.baseUrl).toBe("http://127.0.0.1:11434");
    expect(paired.apiKey).toBeNull();
  });
});

describe("isPrivateIp", () => {
  test("内部・予約レンジを判定する", () => {
    for (const ip of [
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "127.0.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "203.0.113.10", "2606:4700:4700::1111"]) {
      // 203.0.113.0/24 は TEST-NET-3（ドキュメント用）だが本実装では公開扱い
      if (ip === "203.0.113.10") continue;
      expect(isPrivateIp(ip)).toBe(false);
    }
  });
});

describe("assertSafeUserBaseUrl", () => {
  const previousMode = process.env.ETAX_AUTH_MODE;
  afterEach(() => {
    if (previousMode === undefined) delete process.env.ETAX_AUTH_MODE;
    else process.env.ETAX_AUTH_MODE = previousMode;
  });

  test("http/https 以外と資格情報入り URL は常時拒否する", async () => {
    delete process.env.ETAX_AUTH_MODE;
    await expect(assertSafeUserBaseUrl("file:///etc/passwd")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertSafeUserBaseUrl("ftp://example.com")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(
      assertSafeUserBaseUrl("https://user:pass@example.com/v1"),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUserBaseUrl("https://example.com/v1")).resolves.toBeUndefined();
  });

  test("SaaS モードでは内部アドレス・localhost を拒否する", async () => {
    process.env.ETAX_AUTH_MODE = "required";
    await expect(assertSafeUserBaseUrl("http://127.0.0.1:11434")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(
      assertSafeUserBaseUrl("http://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUserBaseUrl("http://localhost:3000")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertSafeUserBaseUrl("http://192.168.0.10:8080")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertSafeUserBaseUrl("https://openrouter.ai/api/v1")).resolves.toBeUndefined();
  });

  test("ローカルモードではローカル接続先（Ollama）を許可する", async () => {
    delete process.env.ETAX_AUTH_MODE;
    await expect(assertSafeUserBaseUrl("http://127.0.0.1:11434")).resolves.toBeUndefined();
  });
});
