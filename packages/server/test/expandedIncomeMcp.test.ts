/**
 * expandedIncomeMcp.test.ts — 拡張所得（Issue #27）の MCP 結合テスト。
 *
 * MCP の income_tax / export_xtx が expanded_income 引数（camelCase）で
 * REST と同じ計算・生成を行えることを担保する（AI自動化対応）。
 * 接続パターンは mcp.test.ts と同じ（APIキー認証＋HTTP）。
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
      content?: { type: string; text: string }[];
      isError?: boolean;
    };
    error?: { message?: string };
  };
}

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

function toolJson(res: McpResponse): Record<string, unknown> {
  const text = res.body.result?.content?.[0]?.text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

const TAXPAYER = {
  name: "テスト太郎",
  name_kana: "テストタロウ",
  zip_code: "7220062",
  address: "広島県尾道市向東町3567-1",
  address_line2: "",
  birth_date: "1980-04-01",
  phone: "080-2500-7879",
  tax_office_name: "尾道",
  tax_office_code: "08121",
  my_number: "",
  user_id: "1234567890123456",
  occupation: "システムエンジニア",
  shop_name: "",
  jan1_address: "",
};

const EXPANDED_CAMEL = {
  temp: { revenue: 1_500_000, expenses: 300_000 },
  dividend: {
    listedRevenue: 800_000,
    listedTrustRevenue: 0,
    listedWithholding: 122_520,
    listedMode: "separate",
    generalRevenue: 200_000,
    generalTrustRevenue: 0,
    generalWithholding: 40_840,
    interestExpense: 100_000,
  },
  stocks: {
    general: { revenue: 1_000_000, otherRevenue: 0, acquisitionCost: 600_000, transferFees: 0, otherExpenses: 0 },
    listed: { revenue: 500_000, otherRevenue: 0, acquisitionCost: 900_000, transferFees: 0, otherExpenses: 0 },
    listedWithholding: 0,
    specialAccounts: [
      { brokerName: "テスト証券", branchName: "本店", withholdingAccount: true, revenue: 2_000_000, cost: 1_900_000, withholding: 15_315 },
    ],
  },
};

describe("MCP（拡張所得）", () => {
  test("income_tax が expanded_income で分離課税まで計算する", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "expanded-mcp@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "test");

    const res = await mcp(
      "tools/call",
      { name: "income_tax", arguments: { year: 2025, expanded_income: EXPANDED_CAMEL } },
      key,
    );
    expect(res.status).toBe(200);
    expect(res.body.result?.isError).toBeUndefined();
    const result = toolJson(res);
    // 帳簿の所得が無いため、基礎控除88万円のうち総合分53万円で引き切れない
    // 35万円が株式等へ配分される（400,000 − 350,000 = 50,000）
    expect(result.taxableSeparateStocks).toBe(50_000);
    expect(result.taxableSeparateDividends).toBe(420_000);
    expect(result.incomeTaxSeparateTotal).toBe(70_500);
    const expanded = result.expanded_income as { comprehensiveAddition: number };
    expect(expanded.comprehensiveAddition).toBe(530_000);
  }, 30_000);

  test("export_xtx が expanded_income で第三表＋計算明細書を生成する", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "expanded-xtx@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "test");

    const res = await mcp(
      "tools/call",
      {
        name: "export_xtx",
        arguments: { year: 2025, taxpayer: TAXPAYER, expanded_income: EXPANDED_CAMEL },
      },
      key,
    );
    expect(res.status).toBe(200);
    expect(res.body.result?.isError).toBeUndefined();
    const result = toolJson(res);
    const xtx = String(result.xtx ?? "");
    expect(xtx).toContain("<KOA020-3");
    expect(xtx).toContain("<KOC080 ");
    expect(xtx).toContain("<EHQ00040>テスト証券</EHQ00040>");
  }, 30_000);
});
