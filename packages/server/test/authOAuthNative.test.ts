/**
 * authOAuthNative.test.ts — OAuth ログインのネイティブアプリ遷移の検証。
 * アプリからの開始では結果がアプリの戻り先（カスタムスキーム）へ返り、
 * 許可されていない戻り先は受け付けないことを確認する。テスト用 PostgreSQL。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createTestDb } from "./testDb";
import { oauthCallbackHandler, oauthStartHandler } from "../src/usecases/authOAuth";

const APP_RETURN = "etaxagent://auth-callback";

const app = new Hono();
app.get("/api/auth/oauth/:provider/start", oauthStartHandler);
app.get("/api/auth/oauth/:provider/callback", oauthCallbackHandler);

const savedEnv = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  ETAX_PUBLIC_URL: process.env.ETAX_PUBLIC_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.ETAX_PUBLIC_URL = "https://example.test";
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
  await createTestDb();
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setCookies(res: Response): string {
  return res.headers.get("set-cookie") ?? "";
}

describe("OAuth 開始（ネイティブ遷移）", () => {
  test("許可された戻り先を指定すると、戻り先の印の Cookie が付く", async () => {
    const res = await app.request(
      `/api/auth/oauth/google/start?native_return=${encodeURIComponent(APP_RETURN)}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location") ?? "").toContain("https://accounts.google.com/");
    expect(setCookies(res)).toContain("etax_oauth_state=");
    expect(setCookies(res)).toContain("etax_oauth_app_return=");
  });

  test("許可されていない戻り先は受け付けない", async () => {
    const res = await app.request(
      `/api/auth/oauth/google/start?native_return=${encodeURIComponent("https://evil.example/cb")}`,
    );
    expect(res.status).toBe(302);
    expect(setCookies(res)).toContain("etax_oauth_state=");
    expect(setCookies(res)).not.toContain("etax_oauth_app_return=");
  });

  test("戻り先を指定しなければ印は付かない", async () => {
    const res = await app.request("/api/auth/oauth/google/start");
    expect(res.status).toBe(302);
    expect(setCookies(res)).not.toContain("etax_oauth_app_return=");
  });
});

describe("OAuth コールバック（ネイティブ遷移）", () => {
  test("state 不一致のエラーはアプリの戻り先へ返す", async () => {
    const res = await app.request("/api/auth/oauth/google/callback?code=x&state=y", {
      headers: { Cookie: "etax_oauth_app_return=1; etax_oauth_state=z" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${APP_RETURN}?auth_error=oauth_state`);
  });

  test("Web フローでは従来どおり Web へ返す", async () => {
    const res = await app.request("/api/auth/oauth/google/callback?code=x&state=y", {
      headers: { Cookie: "etax_oauth_state=z" },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/?auth_error=oauth_state");
  });
});
