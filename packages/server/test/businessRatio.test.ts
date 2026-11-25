/**
 * businessRatio.test.ts — 取引の家事按分（事業割合・按分根拠）の
 * HTTP 結合テスト（Issue #26）。作成・更新・年度置換で割合が往復し、
 * 集計APIが事業分で計算されることを担保する。
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

interface TxBody {
  id: number;
  business_ratio_percent: number;
  business_ratio_basis: string;
}

function createdTx(body: Record<string, unknown>): TxBody {
  return body["transaction"] as TxBody;
}

describe("取引の家事按分（HTTP）", () => {
  test("作成時に事業割合と按分根拠が保存され、一覧にも返る", async () => {
    await createTestDb();
    const created = await req("/api/transactions", {
      method: "POST",
      json: {
        date: "2025-04-01",
        description: "家賃",
        amount: -120000,
        account: "事業口座",
        category: "地代家賃",
        income_type: "business",
        business_ratio_percent: 50,
        business_ratio_basis: "面積割合 20㎡/60㎡",
      },
    });
    expect(created.status).toBe(201);
    const tx = createdTx(created.body);
    expect(tx.business_ratio_percent).toBe(50);
    expect(tx.business_ratio_basis).toBe("面積割合 20㎡/60㎡");

    const listed = await req("/api/transactions?year=2025");
    const rows = listed.body["transactions"] as TxBody[];
    expect(rows.length).toBe(1);
    expect(rows[0]?.business_ratio_percent).toBe(50);
    expect(rows[0]?.business_ratio_basis).toBe("面積割合 20㎡/60㎡");
  });

  test("未指定なら既定（割合100・根拠なし）になり、範囲外は正規化される", async () => {
    await createTestDb();
    const plain = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-04-01", description: "消耗品", amount: -5000, category: "消耗品費" },
    });
    expect(createdTx(plain.body).business_ratio_percent).toBe(100);
    expect(createdTx(plain.body).business_ratio_basis).toBe("");

    const over = await req("/api/transactions", {
      method: "POST",
      json: {
        date: "2025-04-02",
        description: "家賃",
        amount: -120000,
        category: "地代家賃",
        business_ratio_percent: 150,
      },
    });
    expect(createdTx(over.body).business_ratio_percent).toBe(100);
  });

  test("更新で割合と根拠を変更でき、変更履歴のスナップショットにも残る", async () => {
    await createTestDb();
    const created = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-04-01", description: "家賃", amount: -120000, category: "地代家賃" },
    });
    const id = createdTx(created.body).id;
    const updated = await req(`/api/transactions/${id}`, {
      method: "PUT",
      json: { business_ratio_percent: 40, business_ratio_basis: "面積割合" },
    });
    expect(updated.status).toBe(200);
    expect(createdTx(updated.body).business_ratio_percent).toBe(40);
    expect(createdTx(updated.body).business_ratio_basis).toBe("面積割合");

    const history = await req(`/api/transactions/${id}/history`);
    const entries = history.body["history"] as { action: string; after: TxBody | null }[];
    const updatedEntry = entries.find((e) => e.action === "updated");
    expect(updatedEntry?.after?.business_ratio_percent).toBe(40);
  });

  test("年度置換でも割合と根拠が保持される", async () => {
    await createTestDb();
    const replaced = await req("/api/transactions/replace-year", {
      method: "POST",
      json: {
        year: 2025,
        transactions: [
          {
            date: "2025-05-01",
            description: "光熱費",
            amount: -30000,
            category: "水道光熱費",
            income_type: "business",
            business_ratio_percent: 30,
            business_ratio_basis: "使用時間割合",
          },
        ],
      },
    });
    expect(replaced.status).toBe(200);
    const rows = replaced.body["transactions"] as TxBody[];
    expect(rows[0]?.business_ratio_percent).toBe(30);
    expect(rows[0]?.business_ratio_basis).toBe("使用時間割合");
  });

  test("集計APIは按分後の事業分で経費を計算する", async () => {
    const r = await req("/api/calc/aggregate", {
      method: "POST",
      json: {
        year: 2025,
        transactions: [
          { date: "2025-02-01", description: "売上", amount: 1100000, category: "売上高", income_type: "business" },
          { date: "2025-02-02", description: "家賃", amount: -120000, category: "地代家賃", income_type: "business", business_ratio_percent: 50 },
          { date: "2025-02-03", description: "通信費", amount: -11000, category: "通信費", income_type: "business" },
        ],
      },
    });
    expect(r.status).toBe(200);
    expect(r.body["business_expenses"]).toBe(60000 + 11000);
    expect(r.body["business_revenue"]).toBe(1100000);
  });
});
