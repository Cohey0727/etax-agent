/**
 * mcp.test.ts — MCP エンドポイント（/mcp）の HTTP 結合テスト。
 *
 * Streamable HTTP（ステートレス・JSON レスポンス）に対して JSON-RPC を
 * 直接投げ、次を担保する:
 *   - tools/list が公開ツール一式（コア＋ドメイン別）を返す
 *   - ユーザーごとの API キーで tools/call が実行でき、結果が返る
 *   - テナント分離: 他ユーザーのキーでは取引が見えない
 *   - 認証必須モードでトークンなし/不正トークンは 401
 *
 * アプリ本体（src/index.ts）は DATABASE_URL を見て DB プールを作るため、
 * import 前にテスト DB を指させる（httpIntegration.test.ts と同じ方式）。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import {
  createApiKey,
  createUser,
} from "../src/repositories/userRepository";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
// 認証必須モードでは暗号鍵が無いとサーバーが起動を中止するため、
// テスト用の鍵（Base64 の 32 バイト）を用意する。
process.env.ETAX_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  process.env.ETAX_AUTH_MODE = "required";
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

afterAll(() => {
  delete process.env.ETAX_AUTH_MODE;
});

interface McpResponse {
  status: number;
  body: {
    result?: {
      tools?: { name: string }[];
      content?: { type: string; text: string }[];
      isError?: boolean;
    };
    error?: { message?: string };
  };
}

/** JSON-RPC リクエストを /mcp へ投げる。key が無ければ Authorization を付けない。 */
async function mcp(
  method: string,
  params: Record<string, unknown>,
  key?: string,
): Promise<McpResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const res = await appFetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const body = (await res.json().catch(() => ({}))) as McpResponse["body"];
  return { status: res.status, body };
}

/** tools/call のテキスト結果を JSON として読む。 */
function toolJson(res: McpResponse): Record<string, unknown> {
  const text = res.body.result?.content?.[0]?.text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

describe("MCP エンドポイント", () => {
  test("APIキーで tools/list が公開ツール一式を返す", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "list@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "test");

    const res = await mcp("tools/list", {}, key);
    expect(res.status).toBe(200);
    const names = (res.body.result?.tools ?? []).map((t) => t.name);
    // コア
    expect(names).toContain("aggregate_year");
    expect(names).toContain("export_xtx");
    expect(names).toContain("list_transactions");
    // ドメイン別モジュール
    expect(names).toContain("get_taxpayer_profile");
    expect(names).toContain("save_filing_inputs");
    expect(names).toContain("create_filing_snapshot");
    expect(names).toContain("import_csv");
    expect(names).toContain("get_transaction_history");
    expect(names).toContain("replace_year_transactions");
    expect(names).toContain("update_fixed_asset");
    expect(names).toContain("attach_fixed_asset_image");
    expect(names).toContain("health");
    expect(names).toContain("list_account_master");
    expect(names).toContain("monthly_breakdown");
    expect(names).toContain("update_systemone_settings");
    expect(names.length).toBeGreaterThanOrEqual(45);
  });

  test("APIキーで tools/call が実行でき、テナント分離される", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a-mcp@example.com", "password-123");
    const userB = await createUser(db, "b-mcp@example.com", "password-456");
    const keyA = (await createApiKey(db, userA.id, "a")).key;
    const keyB = (await createApiKey(db, userB.id, "b")).key;

    const added = await mcp(
      "tools/call",
      {
        name: "add_transaction",
        arguments: {
          date: "2026-02-01",
          description: "開発費用",
          amount: 100000,
          category: "売上高",
          income_type: "business",
        },
      },
      keyA,
    );
    expect(added.status).toBe(200);
    expect(added.body.result?.isError).toBeUndefined();

    const listA = await mcp("tools/call", { name: "list_transactions", arguments: {} }, keyA);
    const parsedA = toolJson(listA);
    expect(parsedA["count"]).toBe(1);

    // 他ユーザーのキーでは見えない
    const listB = await mcp("tools/call", { name: "list_transactions", arguments: {} }, keyB);
    const parsedB = toolJson(listB);
    expect(parsedB["count"]).toBe(0);

    // 集計も A の帳簿だけから計算される
    const agg = await mcp(
      "tools/call",
      { name: "aggregate_year", arguments: { year: 2026 } },
      keyA,
    );
    const parsedAgg = toolJson(agg);
    expect(parsedAgg["business_revenue"]).toBe(100000);
  });

  test("add_transaction / update_transaction で事業割合と按分根拠を扱える", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "ratio-mcp@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "ratio");

    const added = await mcp(
      "tools/call",
      {
        name: "add_transaction",
        arguments: {
          date: "2026-03-01",
          description: "家賃",
          amount: -120000,
          category: "地代家賃",
          income_type: "business",
          business_ratio_percent: 50,
          business_ratio_basis: "面積割合",
        },
      },
      key,
    );
    expect(added.body.result?.isError).toBeUndefined();
    const addedTx = toolJson(added)["transaction"] as {
      id: number;
      business_ratio_percent: number;
      business_ratio_basis: string;
    };
    expect(addedTx.business_ratio_percent).toBe(50);
    expect(addedTx.business_ratio_basis).toBe("面積割合");

    const updated = await mcp(
      "tools/call",
      {
        name: "update_transaction",
        arguments: { id: addedTx.id, business_ratio_percent: 25 },
      },
      key,
    );
    const updatedTx = toolJson(updated)["transaction"] as { business_ratio_percent: number };
    expect(updatedTx.business_ratio_percent).toBe(25);

    // 集計（aggregate_year）は事業分で計算される: 経費は 120,000 × 25% = 30,000
    const agg = await mcp(
      "tools/call",
      { name: "aggregate_year", arguments: { year: 2026 } },
      key,
    );
    expect(toolJson(agg)["business_expenses"]).toBe(30000);
  });

  test("認証必須モードではトークンなし・不正トークンは 401", async () => {
    await createTestDb();
    const noToken = await mcp("tools/list", {});
    expect(noToken.status).toBe(401);
    const badToken = await mcp("tools/list", {}, "etax_bogus-key");
    expect(badToken.status).toBe(401);
  });

  test("未知のツールは isError で返る", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "unknown@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "test");
    const res = await mcp("tools/call", { name: "no_such_tool", arguments: {} }, key);
    expect(res.status).toBe(200);
    expect(res.body.result?.isError).toBe(true);
  });
});
