/**
 * historyViewer.test.ts — 訂正・削除履歴ビューア用 API の HTTP 結合テスト
 * （Issue #20 Phase 0 の JIIMA 自己点検対応）。
 *
 * 担保すること:
 * - 全取引の変更履歴一覧（GET /api/transactions/history）が、複数取引の
 *   登録・更新・削除を新しい順に返し、削除済み取引の履歴も含むこと
 * - 取引単位の履歴（GET /api/transactions/{id}/history）と一覧ルートが
 *   両立すること（/history が /{id} に飲み込まれないこと）
 * - 提出の記録の変更履歴（GET /api/filing-submissions/{year}/history）が
 *   登録・更新・削除を変更前後スナップショット付きで新しい順に返すこと
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";

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

async function req(
  path: string,
  init: { method?: string; json?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
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

interface HistoryEntryBody {
  id: number;
  transaction_id?: number;
  kind?: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

function historyOf(body: Record<string, unknown>): HistoryEntryBody[] {
  return body["history"] as HistoryEntryBody[];
}

const txInput = {
  date: "2026-02-01",
  fiscal_year: 2026,
  description: "AWS 利用料",
  amount: -5500,
  account: "事業口座",
  category: "通信費",
  income_type: "business",
  tax_category: "",
};

describe("全取引の変更履歴一覧（ビューア用）", () => {
  test("複数取引の登録・更新・削除が新しい順に返り、削除済みも含む", async () => {
    await createTestDb();
    const createdA = await req("/api/transactions", { method: "POST", json: txInput });
    expect(createdA.status).toBe(201);
    const idA = (createdA.body["transaction"] as { id: number }).id;
    const createdB = await req("/api/transactions", {
      method: "POST",
      json: { ...txInput, description: "ドメイン更新料", amount: -2200 },
    });
    const idB = (createdB.body["transaction"] as { id: number }).id;

    const updated = await req(`/api/transactions/${idA}`, {
      method: "PUT",
      json: { amount: -6600 },
    });
    expect(updated.status).toBe(200);
    const deleted = await req(`/api/transactions/${idB}`, { method: "DELETE" });
    expect(deleted.status).toBe(200);

    const listed = await req("/api/transactions/history");
    expect(listed.status).toBe(200);
    const history = historyOf(listed.body);
    expect(history.length).toBe(4);
    // 新しい順: B削除 → A更新 → B登録 → A登録
    expect(history.map((h) => h.action)).toEqual(["deleted", "updated", "created", "created"]);
    expect(history[0].transaction_id).toBe(idB);
    expect(history[0].after?.["deleted_at"]).not.toBeNull();
    expect(history[1].transaction_id).toBe(idA);
    expect(history[1].before?.["amount"]).toBe(-5500);
    expect(history[1].after?.["amount"]).toBe(-6600);
    expect(history[3].transaction_id).toBe(idA);
    expect(history[3].before).toBeNull();
  });

  test("limit で件数を絞れる", async () => {
    await createTestDb();
    await req("/api/transactions", { method: "POST", json: txInput });
    await req("/api/transactions", { method: "POST", json: txInput });
    const listed = await req("/api/transactions/history?limit=1");
    expect(listed.status).toBe(200);
    expect(historyOf(listed.body).length).toBe(1);
    expect(listed.body["count"]).toBe(1);
  });

  test("取引単位の履歴ルートと両立する", async () => {
    await createTestDb();
    const created = await req("/api/transactions", { method: "POST", json: txInput });
    const id = (created.body["transaction"] as { id: number }).id;
    const single = await req(`/api/transactions/${id}/history`);
    expect(single.status).toBe(200);
    const history = historyOf(single.body);
    expect(history.length).toBe(1);
    expect(history[0].action).toBe("created");
    expect(history[0].transaction_id).toBe(id);
  });
});

describe("提出の記録の変更履歴（ビューア用）", () => {
  test("登録・更新・削除がスナップショット付きで新しい順に返る", async () => {
    await createTestDb();
    const saved = await req("/api/filing-submissions/2026/income", {
      method: "PUT",
      json: { acceptance_number: "202602150001", submitted_date: "2026-02-15" },
    });
    expect(saved.status).toBe(200);
    const updated = await req("/api/filing-submissions/2026/income", {
      method: "PUT",
      json: { acceptance_number: "202602150002", submitted_date: "2026-02-16" },
    });
    expect(updated.status).toBe(200);
    const removed = await req("/api/filing-submissions/2026/income", { method: "DELETE" });
    expect(removed.status).toBe(200);

    const listed = await req("/api/filing-submissions/2026/history");
    expect(listed.status).toBe(200);
    const history = historyOf(listed.body);
    expect(history.length).toBe(3);
    expect(history.map((h) => h.action)).toEqual(["deleted", "updated", "created"]);
    expect(history.every((h) => h.kind === "income")).toBe(true);
    expect(history[0].before?.["acceptance_number"]).toBe("202602150002");
    expect(history[0].after).toBeNull();
    expect(history[1].before?.["acceptance_number"]).toBe("202602150001");
    expect(history[1].after?.["acceptance_number"]).toBe("202602150002");
    expect(history[2].before).toBeNull();
    expect(history[2].after?.["submitted_date"]).toBe("2026-02-15");
  });

  test("履歴のない年度は空で返る", async () => {
    await createTestDb();
    const listed = await req("/api/filing-submissions/2031/history");
    expect(listed.status).toBe(200);
    expect(historyOf(listed.body)).toEqual([]);
    expect(listed.body["count"]).toBe(0);
  });
});
