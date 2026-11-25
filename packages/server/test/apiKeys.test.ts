/**
 * apiKeys.test.ts — API キーの有効期限・失効まわりの検証。
 *
 * リポジトリ層: 期限の境界（期限時刻ちょうどで無効）、期限切れ・失効の
 * 認証拒否、last_used_at の更新条件、所有者分離、状態判定の優先順位。
 * HTTP 層: 発行（平文は発行時だけ）・一覧（平文を含まない）・失効の往復と、
 * 失効したキーが REST 認証でも拒否されること、MCP 接続情報の取得。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import {
  apiKeyStatus,
  createApiKey,
  createSession,
  createUser,
  listApiKeyRows,
  resolveApiKeyUserId,
  revokeApiKeyRow,
} from "../src/repositories/userRepository";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ETAX_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  process.env.ETAX_DATA_DIR = await mkdtemp(join(tmpdir(), "etax-apikeys-data-"));
  process.env.ETAX_AUTH_MODE = "required";
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

describe("APIキーの有効期限（リポジトリ）", () => {
  test("無期限キーは解決でき、last_used_at が更新される", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "a@example.com", "password-123");
    const { row, key } = await createApiKey(db, user.id, "no-expiry");
    expect(row.expiresAt).toBeNull();
    const usedAt = new Date("2026-06-01T00:00:00.000Z");
    expect(await resolveApiKeyUserId(db, key, usedAt)).toBe(user.id);
    const [listed] = await listApiKeyRows(db, user.id);
    expect(listed.lastUsedAt?.toISOString()).toBe(usedAt.toISOString());
    // 無期限なので遠未来でも有効
    expect(await resolveApiKeyUserId(db, key, new Date("2099-01-01T00:00:00.000Z"))).toBe(user.id);
  });

  test("期限内は有効、期限時刻ちょうどで無効になる（境界）", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "a@example.com", "password-123");
    const expiresAt = new Date("2026-12-31T15:00:00.000Z");
    const { key } = await createApiKey(db, user.id, "expiring", expiresAt);
    expect(await resolveApiKeyUserId(db, key, new Date(expiresAt.getTime() - 1))).toBe(user.id);
    expect(await resolveApiKeyUserId(db, key, expiresAt)).toBeUndefined();
    expect(await resolveApiKeyUserId(db, key, new Date(expiresAt.getTime() + 1))).toBeUndefined();
  });

  test("期限切れキーは last_used_at を更新しない", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "a@example.com", "password-123");
    const expiresAt = new Date("2026-01-01T00:00:00.000Z");
    const { key } = await createApiKey(db, user.id, "expired", expiresAt);
    expect(await resolveApiKeyUserId(db, key, new Date("2026-06-01T00:00:00.000Z"))).toBeUndefined();
    const [listed] = await listApiKeyRows(db, user.id);
    expect(listed.lastUsedAt).toBeNull();
  });
});

describe("APIキーの失効と状態（リポジトリ）", () => {
  test("失効したキーは拒否され、失効は冪等、状態は revoked が期限切れより優先", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "a@example.com", "password-123");
    const past = new Date("2026-01-01T00:00:00.000Z");
    const { row, key } = await createApiKey(db, user.id, "revoke-me", past);
    expect(apiKeyStatus(row, new Date("2026-06-01T00:00:00.000Z"))).toBe("expired");
    expect(await revokeApiKeyRow(db, user.id, row.id)).toBe(true);
    expect(await revokeApiKeyRow(db, user.id, row.id)).toBe(true);
    const [listed] = await listApiKeyRows(db, user.id);
    expect(listed.revokedAt).not.toBeNull();
    expect(apiKeyStatus(listed, new Date("2026-06-01T00:00:00.000Z"))).toBe("revoked");
    // 期限内の時点で使っても、失効済みなので拒否される
    expect(await resolveApiKeyUserId(db, key, new Date("2025-12-01T00:00:00.000Z"))).toBeUndefined();
  });

  test("他人のキーは失効できず、一覧にも混ざらない", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");
    const { row } = await createApiKey(db, userA.id, "a-key");
    expect(await revokeApiKeyRow(db, userB.id, row.id)).toBe(false);
    expect(await listApiKeyRows(db, userB.id)).toHaveLength(0);
    const [listed] = await listApiKeyRows(db, userA.id);
    expect(listed.revokedAt).toBeNull();
    expect(apiKeyStatus(listed)).toBe("active");
  });
});

describe("APIキー REST API（HTTP）", () => {
  test("発行→一覧→失効の往復。平文は発行時だけ、一覧には出ない", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "http@example.com", "password-123");
    const session = await createSession(db, user.id);
    const auth = { Authorization: `Bearer ${session}` };

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const createRes = await appFetch(
      new Request("http://localhost/api/auth/api-keys", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Claude Code", expires_at: expiresAt }),
      }),
    );
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      id: number;
      key: string;
      status: string;
      expires_at: string | null;
      revoked_at: string | null;
    };
    expect(created.key.startsWith("etax_")).toBe(true);
    expect(created.status).toBe("active");
    expect(created.expires_at).toBe(expiresAt);
    expect(created.revoked_at).toBeNull();

    const listRes = await appFetch(
      new Request("http://localhost/api/auth/api-keys", { headers: auth }),
    );
    expect(listRes.status).toBe(200);
    const listText = await listRes.text();
    expect(listText).not.toContain(created.key);
    const list = JSON.parse(listText) as { id: number; status: string }[];
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("active");

    // 発行したキー自体でも認証できる（失効前）
    const byKeyRes = await appFetch(
      new Request("http://localhost/api/auth/api-keys", {
        headers: { Authorization: `Bearer ${created.key}` },
      }),
    );
    expect(byKeyRes.status).toBe(200);

    const revokeRes = await appFetch(
      new Request(`http://localhost/api/auth/api-keys/${created.id}`, {
        method: "DELETE",
        headers: auth,
      }),
    );
    expect(revokeRes.status).toBe(200);
    expect(await revokeRes.json()).toEqual({ revoked: true });

    const afterRes = await appFetch(
      new Request("http://localhost/api/auth/api-keys", { headers: auth }),
    );
    const after = (await afterRes.json()) as { status: string; revoked_at: string | null }[];
    expect(after[0].status).toBe("revoked");
    expect(after[0].revoked_at).not.toBeNull();

    // 失効したキーは認証で拒否される
    const rejectedRes = await appFetch(
      new Request("http://localhost/api/auth/api-keys", {
        headers: { Authorization: `Bearer ${created.key}` },
      }),
    );
    expect(rejectedRes.status).toBe(401);
  });

  test("過去の有効期限は 400、他人のキーの失効は 404", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");
    const sessionA = await createSession(db, userA.id);
    const sessionB = await createSession(db, userB.id);

    const pastRes = await appFetch(
      new Request("http://localhost/api/auth/api-keys", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionA}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "past", expires_at: "2020-01-01T00:00:00.000Z" }),
      }),
    );
    expect(pastRes.status).toBe(400);

    const { row } = await createApiKey(db, userA.id, "a-key");
    const foreignRes = await appFetch(
      new Request(`http://localhost/api/auth/api-keys/${row.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${sessionB}` },
      }),
    );
    expect(foreignRes.status).toBe(404);
    const [listed] = await listApiKeyRows(db, userA.id);
    expect(listed.revokedAt).toBeNull();
  });

  test("MCP 接続情報にエンドポイントとツール一覧が返る", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "info@example.com", "password-123");
    const session = await createSession(db, user.id);
    const res = await appFetch(
      new Request("http://localhost/api/auth/mcp-info", {
        headers: { Authorization: `Bearer ${session}` },
      }),
    );
    expect(res.status).toBe(200);
    const info = (await res.json()) as {
      endpoint_path: string;
      tool_count: number;
      tools: { name: string; description: string }[];
    };
    expect(info.endpoint_path).toBe("/mcp");
    expect(info.tool_count).toBe(info.tools.length);
    expect(info.tool_count).toBeGreaterThan(0);
    expect(info.tools.some((tool) => tool.name === "health")).toBe(true);
  });
});
