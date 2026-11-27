/**
 * totpReplay.test.ts — TOTP コードの再利用拒否と、有効化済みの再設定の拒否（HTTP）。
 *
 * - 受け入れたコード（時間カウンタ）以前のコードは、新しいチャレンジに
 *   出しても通らない（RFC 6238 §5.2）。
 * - 有効化に使ったコードもログインには使えない。
 * - TOTP が有効なまま再設定（秘密の差し替え）はできない。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import { currentTotpCode, generateTotpSecret } from "../src/lib/totp";
import {
  createSession,
  createUser,
  getUserByEmail,
  readUserTotpSecret,
  setUserTotpEnabled,
  setUserTotpSecret,
} from "../src/repositories/userRepository";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ETAX_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  process.env.ETAX_DATA_DIR = await mkdtemp(join(tmpdir(), "etax-totp-replay-data-"));
  process.env.ETAX_AUTH_MODE = "required";
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return appFetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.77", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

async function loginWithTotp(email: string, code: string): Promise<number> {
  const login = await postJson("/api/auth/login", { email, password: "password-123" });
  const { challenge } = (await login.json()) as { challenge: string };
  const res = await postJson("/api/auth/login/totp", { challenge, code });
  return res.status;
}

describe("TOTP コードの再利用", () => {
  test("一度通ったコードは、別のログインのチャレンジに出しても通らない", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "replay@example.com", "password-123");
    const secret = generateTotpSecret();
    await setUserTotpSecret(db, user.id, secret);
    await setUserTotpEnabled(db, user.id, true);
    const code = currentTotpCode(secret);
    expect(await loginWithTotp("replay@example.com", code)).toBe(200);
    expect(await loginWithTotp("replay@example.com", code)).toBe(401);
  });

  test("有効化に使ったコードはログインに使えない", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "enable-replay@example.com", "password-123");
    const session = await createSession(db, user.id);
    const auth = { Authorization: `Bearer ${session}` };
    const setup = await postJson("/api/auth/totp/setup", {}, auth);
    const { secret } = (await setup.json()) as { secret: string };
    const code = currentTotpCode(secret);
    const enable = await postJson("/api/auth/totp/enable", { code }, auth);
    expect(enable.status).toBe(200);
    expect(await loginWithTotp("enable-replay@example.com", code)).toBe(401);
  });
});

describe("TOTP の再設定", () => {
  test("有効化済みのまま再設定すると 409 で、秘密は差し替わらない", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "resetup@example.com", "password-123");
    const secret = generateTotpSecret();
    await setUserTotpSecret(db, user.id, secret);
    await setUserTotpEnabled(db, user.id, true);
    const session = await createSession(db, user.id);
    const res = await postJson(
      "/api/auth/totp/setup",
      { code: currentTotpCode(secret) },
      { Authorization: `Bearer ${session}` },
    );
    expect(res.status).toBe(409);
    const after = await getUserByEmail(db, "resetup@example.com");
    expect(after?.totpEnabled).toBe(true);
    expect(after ? readUserTotpSecret(after) : null).toBe(secret);
  });
});
