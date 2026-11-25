/**
 * agricultureMcp.test.ts — 農業所得（Issue #24 Phase 1）の MCP 結合テスト。
 *
 * MCP の income_tax / export_xtx が agriculture 引数（camelCase）で
 * REST と同じ計算・生成を行えること、固定資産台帳に agriculture 区分を
 * 登録でき XTX の減価償却明細（KOA240-3）まで流れることを担保する
 * （AI自動化対応）。接続パターンは expandedIncomeMcp.test.ts と同じ。
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
  zip_code: "1000001",
  address: "東京都千代田区霞が関一丁目1番1号",
  address_line2: "",
  birth_date: "1980-04-01",
  phone: "090-0000-0000",
  tax_office_name: "麹町",
  tax_office_code: "01101",
  my_number: "",
  user_id: "1234567890123456",
  occupation: "農業",
  shop_name: "",
  jan1_address: "",
};

const AGRICULTURE_CAMEL = {
  farmName: "テスト農園",
  salesAmount: 3_000_000,
  householdConsumption: 120_000,
  miscRevenue: 30_000,
  produceOpeningInventory: 100_000,
  produceClosingInventory: 150_000,
  otherOpeningInventory: 40_000,
  otherClosingInventory: 60_000,
  expenseTotals: {
    肥料費: 400_000,
    減価償却費: 200_000,
    雇人費: 500_000,
    地代賃借料: 240_000,
    貸倒金: 10_000,
    雑費: 20_000,
  },
  familyWorkerSalary: 600_000,
  familyWorkerDeduction: 860_000,
  badDebtProvisionIn: 15_000,
  badDebtProvisionBack: 5_000,
  cultivationCostDeduction: 80_000,
  beefCattleExemptionAmount: 0,
};

describe("MCP（農業所得）", () => {
  test("income_tax が agriculture で決算書計算と合計所得への算入を行う", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "agriculture-mcp@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "test");

    const res = await mcp(
      "tools/call",
      { name: "income_tax", arguments: { year: 2025, agriculture: AGRICULTURE_CAMEL } },
      key,
    );
    expect(res.status).toBe(200);
    expect(res.body.result?.isError).toBeUndefined();
    const result = toolJson(res);
    const agriculture = result.agriculture as {
      revenueTotal: number;
      expensesTotal: number;
      balanceAmount: number;
    };
    expect(agriculture.revenueTotal).toBe(3_100_000);
    expect(agriculture.expensesTotal).toBe(1_270_000);
    expect(agriculture.balanceAmount).toBe(1_830_000);
    // 帳簿の所得が無いため、農業の控除前所得 1,220,000 から青色申告
    // 特別控除 650,000 を引いた 570,000 が合計所得になる
    expect(result.totalIncome).toBe(570_000);
  }, 30_000);

  test("export_xtx が agriculture で KOA240 を生成する", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "agriculture-xtx@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "test");

    const res = await mcp(
      "tools/call",
      {
        name: "export_xtx",
        arguments: { year: 2025, taxpayer: TAXPAYER, agriculture: AGRICULTURE_CAMEL },
      },
      key,
    );
    expect(res.status).toBe(200);
    expect(res.body.result?.isError).toBeUndefined();
    const result = toolJson(res);
    const xtx = String(result.xtx ?? "");
    expect(xtx).toContain('<KOA240 VR="8.0"');
    expect(xtx).toContain("<ABB00320>570000</ABB00320>");
  }, 30_000);

  test("白色では export_xtx が KOA120 を生成する", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "agriculture-white@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "test");

    const res = await mcp(
      "tools/call",
      {
        name: "export_xtx",
        arguments: {
          year: 2025,
          taxpayer: TAXPAYER,
          agriculture: AGRICULTURE_CAMEL,
          filing_type: "white",
        },
      },
      key,
    );
    expect(res.status).toBe(200);
    const result = toolJson(res);
    const xtx = String(result.xtx ?? "");
    expect(xtx).toContain('<KOA120 VR="9.0"');
    expect(xtx).toContain("<AJG00430>970000</AJG00430>");
  }, 30_000);

  test("農業区分の固定資産を登録でき、XTX の減価償却明細に流れる", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "agriculture-asset@example.com", "password-123");
    const { key } = await createApiKey(db, user.id, "test");

    const register = await mcp(
      "tools/call",
      {
        name: "register_fixed_asset",
        arguments: {
          name: "トラクター",
          quantity: "1台",
          income_type: "agriculture",
          acquisition_date: "2023-04-01",
          cost: 2_000_000,
          useful_life_years: 7,
          method: "straight_line",
          business_ratio_percent: 100,
        },
      },
      key,
    );
    expect(register.status).toBe(200);
    expect(register.body.result?.isError).toBeUndefined();
    const registered = toolJson(register) as {
      asset: { income_type: string } | null;
    };
    expect(registered.asset?.income_type).toBe("agriculture");

    const depreciation = await mcp(
      "tools/call",
      { name: "get_depreciation", arguments: { year: 2025 } },
      key,
    );
    const depResult = toolJson(depreciation) as {
      deductible_totals: { agriculture: number };
    };
    expect(depResult.deductible_totals.agriculture).toBeGreaterThan(0);

    const res = await mcp(
      "tools/call",
      {
        name: "export_xtx",
        arguments: { year: 2025, taxpayer: TAXPAYER, agriculture: AGRICULTURE_CAMEL },
      },
      key,
    );
    expect(res.status).toBe(200);
    const result = toolJson(res);
    const xtx = String(result.xtx ?? "");
    expect(xtx).toContain('<KOA240-3 page="3">');
    expect(xtx).toContain("<APF02050>トラクター</APF02050>");
  }, 30_000);
});
