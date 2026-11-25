/**
 * httpIntegration.test.ts — Hono アプリ全体を通す HTTP 結合テスト（Issue #14）。
 *
 * これまで結合テストはリポジトリ単位しか無く、ルーティング・認証
 * ミドルウェア・バリデーションを通した検証が無かった。主要 API の
 * 正常系と、認証必須モードでの 401 / テナント分離を代表ケースとして担保する。
 *
 * アプリ本体（src/index.ts）は DATABASE_URL を見て DB プールを作るため、
 * import 前にテスト DB を指させる。データの用意は testDb（同じ DB）経由。
 */
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { createSession, createUser } from "../src/repositories/userRepository";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
delete process.env.ETAX_AUTH_MODE;

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

afterEach(() => {
  delete process.env.ETAX_AUTH_MODE;
});

async function req(
  path: string,
  init: { method?: string; json?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.cookie) headers["Cookie"] = `etax_session=${init.cookie}`;
  const res = await appFetch(
    new Request(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

describe("HTTP 結合: 正常系", () => {
  test("GET /api/health が 200", async () => {
    const r = await req("/api/health");
    expect(r.status).toBe(200);
  });

  test("POST /api/calc/aggregate が集計を返す（DB不要）", async () => {
    const r = await req("/api/calc/aggregate", {
      method: "POST",
      json: {
        year: 2025,
        transactions: [
          { date: "2025-02-01", description: "開発費用", amount: 100000, category: "売上高", income_type: "business" },
          { date: "2025-02-02", description: "AWS", amount: -3000, category: "通信費", income_type: "business" },
        ],
      },
    });
    expect(r.status).toBe(200);
    expect(r.body["business_income"]).toBe(97000);
  });

  test("取引の登録→一覧→更新→削除を通しで実行できる", async () => {
    await createTestDb();
    const created = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-04-01", description: "売上", amount: 50000, category: "売上高", income_type: "business" },
    });
    expect(created.status).toBe(201);
    const tx = created.body["transaction"] as { id: number };
    expect(tx.id).toBeGreaterThan(0);

    const listed = await req("/api/transactions?year=2025");
    expect(listed.status).toBe(200);
    expect(listed.body["count"]).toBe(1);

    const updated = await req(`/api/transactions/${tx.id}`, {
      method: "PUT",
      json: { category: "雑収入" },
    });
    expect(updated.status).toBe(200);
    expect((updated.body["transaction"] as { category: string }).category).toBe("雑収入");

    const removed = await req(`/api/transactions/${tx.id}`, { method: "DELETE" });
    expect(removed.status).toBe(200);
    const after = await req("/api/transactions?year=2025");
    expect(after.body["count"]).toBe(0);
  });

  test("POST /api/import/csv で CSV を取り込み、再取込で重複しない", async () => {
    await createTestDb();
    const csv = "日付,摘要,金額\n2025/05/01,売上テスト,10000\n2025/05/02,消耗品,-2000\n";
    const first = await req("/api/import/csv", {
      method: "POST",
      json: { filename: "test.csv", content: csv },
    });
    expect(first.status).toBe(200);
    expect(first.body["count"]).toBe(2);
    expect(first.body["persisted"]).toBe(true);

    const second = await req("/api/import/csv", {
      method: "POST",
      json: { filename: "test.csv", content: csv },
    });
    expect(second.status).toBe(200);
    expect(second.body["count"]).toBe(0);
    expect(second.body["duplicatesSkipped"]).toBe(2);
  });
});

describe("HTTP 結合: 認証必須モード", () => {
  test("未ログインは 401、ログイン済みは通る", async () => {
    const db = await createTestDb();
    process.env.ETAX_AUTH_MODE = "required";
    try {
      const anon = await req("/api/transactions");
      expect(anon.status).toBe(401);

      const user = await createUser(db, "http-a@example.com", "password-123");
      const token = await createSession(db, user.id);
      const authed = await req("/api/transactions", { cookie: token });
      expect(authed.status).toBe(200);
    } finally {
      delete process.env.ETAX_AUTH_MODE;
    }
  });

  test("テナント分離: 他ユーザーの取引は見えない", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "tenant-a@example.com", "password-123");
    const userB = await createUser(db, "tenant-b@example.com", "password-123");
    const tokenA = await createSession(db, userA.id);
    const tokenB = await createSession(db, userB.id);

    const created = await req("/api/transactions", {
      method: "POST",
      cookie: tokenA,
      json: { date: "2025-06-01", description: "Aの売上", amount: 1000, category: "売上高", income_type: "business" },
    });
    expect(created.status).toBe(201);

    const seenByA = await req("/api/transactions?year=2025", { cookie: tokenA });
    expect(seenByA.body["count"]).toBe(1);
    const seenByB = await req("/api/transactions?year=2025", { cookie: tokenB });
    expect(seenByB.body["count"]).toBe(0);
  });
});
