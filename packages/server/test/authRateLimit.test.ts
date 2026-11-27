/**
 * authRateLimit.test.ts — 認証エンドポイントのレート制限（HTTP）の検証。
 *
 * - 制限キーのクライアント IP は CF-Connecting-IP から取り、クライアントが
 *   自由に書ける X-Forwarded-For を変えても回避できないこと。
 * - ログイン・TOTP・マジックリンクは、IP を変えても同じ利用者への試行が
 *   利用者単位の上限で止まること。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import { issueChallenge } from "../src/lib/loginChallenge";
import { createUser } from "../src/repositories/userRepository";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ETAX_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  process.env.ETAX_DATA_DIR = await mkdtemp(join(tmpdir(), "etax-ratelimit-data-"));
  process.env.ETAX_AUTH_MODE = "required";
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

function postJson(path: string, body: unknown, headers: Record<string, string>) {
  return appFetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("認証のレート制限（HTTP）", () => {
  test("X-Forwarded-For を変えても、同じ接続元 IP のログイン試行は上限で止まる", async () => {
    await createTestDb();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await postJson(
        "/api/auth/login",
        { email: `spoof-${i}@example.com`, password: "wrong-pass" },
        { "CF-Connecting-IP": "198.51.100.30", "X-Forwarded-For": `203.0.113.${i}` },
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  test("接続元 IP を変えても、同じメールアドレスへのログイン試行は上限で止まる", async () => {
    const db = await createTestDb();
    await createUser(db, "target-login@example.com", "password-123");
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await postJson(
        "/api/auth/login",
        { email: "Target-Login@example.com", password: "wrong-pass" },
        { "CF-Connecting-IP": `198.51.100.${100 + i}` },
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  test("チャレンジを取り直しても、同じユーザーへの TOTP 試行は上限で止まる", async () => {
    await createTestDb();
    // 制限の記録はプロセス内に残り、テスト DB のユーザー ID は毎回 1 から振り直される。
    // 他のテストのユーザーと数え合わないよう、使われない ID のチャレンジで試す。
    const userId = 900_001;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await postJson(
        "/api/auth/login/totp",
        { challenge: issueChallenge(userId, "totp-login"), code: "abcdef" },
        { "CF-Connecting-IP": `198.51.100.${150 + i}` },
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  test("接続元 IP を変えても、同じメールアドレスへのマジックリンク発行は上限で止まる", async () => {
    await createTestDb();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await postJson(
        "/api/auth/magic-link",
        { email: "target-magic@example.com" },
        { "CF-Connecting-IP": `198.51.100.${200 + i}` },
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
