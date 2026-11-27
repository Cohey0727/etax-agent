/**
 * apiContract.test.ts — アプリ全体を通した HTTP の約束ごとの検証。
 * 起動設定、エラー応答の形（{ error: string }）、入力検証のステータスを確かめる。
 *
 * アプリ本体（src/index.ts）は DATABASE_URL を見て DB プールを作るため、
 * import 前にテスト DB を指させる。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
delete process.env.ETAX_AUTH_MODE;

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;
let serverOptions: { idleTimeout?: number };

beforeAll(async () => {
  const mod = await import("../src/index");
  serverOptions = mod.default;
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

interface RequestInit {
  method?: string;
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
}

async function req(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { ...init.headers };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await appFetch(
    new Request(`http://localhost${path}`, { method: init.method ?? "GET", headers, body }),
  );
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: parsed };
}

describe("起動設定", () => {
  test("idleTimeout を Bun の既定（10秒）より長くする", () => {
    // エージェント対話や科目判定の外部呼び出しは 10 秒を超えることがあり、
    // 既定のままだと応答前に接続が切られる。
    expect(serverOptions.idleTimeout ?? 10).toBeGreaterThan(10);
  });
});
