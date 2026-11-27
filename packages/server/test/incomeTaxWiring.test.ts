/**
 * incomeTaxWiring.test.ts — 所得税の計算の配線（REST・MCP）が同じ合計所得金額を出すことの検証。
 *
 * 事業所得の損失は一時所得と損益通算してから一時所得を1/2にする（所得税法22条2項2号・
 * 同法施行令198条）。事業所得 −1,000,000・一時所得の金額 1,500,000 なら
 * 合計所得金額は (1,500,000 − 1,000,000) × 1/2 = 250,000。
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_EXPANDED_INCOME,
  EMPTY_TAX_CREDIT_INPUTS,
} from "@etax/shared";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import { createUser } from "../src/repositories/userRepository";
import { McpToolResult } from "../src/services/mcp/mcpToolKit";
import { dispatchMcpTool } from "../src/services/mcp/mcpTools";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
delete process.env.ETAX_AUTH_MODE;
delete process.env.ETAX_XSD_DIR;

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;
let userId: number;

beforeAll(async () => {
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
});

beforeEach(async () => {
  const db = await createTestDb();
  userId = (await createUser(db, "income-tax-wiring@example.com", "password-123")).id;
});

async function requestJson(path: string, json: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await appFetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function call(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  return runWithTenant(userId, () => dispatchMcpTool(name, args));
}

function json(result: McpToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? "") as Record<string, unknown>;
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

/** 事業所得 −1,000,000（売上 500,000・外注費 1,500,000） */
const LOSS_TRANSACTIONS = [
  { date: "2025-03-01", description: "売上", amount: 500_000, category: "売上高" },
  { date: "2025-04-01", description: "外注", amount: -1_500_000, category: "外注費" },
];

/** 一時所得の金額 1,500,000（収入 2,000,000 − 特別控除 500,000） */
const TEMP_CAMEL = { ...EMPTY_EXPANDED_INCOME, temp: { revenue: 2_000_000, expenses: 0 } };
const TEMP_WIRE = {
  temp: { revenue: 2_000_000, expenses: 0 },
  dividend: {
    listed_revenue: 0,
    listed_trust_revenue: 0,
    listed_withholding: 0,
    listed_mode: "comprehensive",
    general_revenue: 0,
    general_trust_revenue: 0,
    general_withholding: 0,
    interest_expense: 0,
  },
  stocks: {
    general: { revenue: 0, other_revenue: 0, acquisition_cost: 0, transfer_fees: 0, other_expenses: 0 },
    listed: { revenue: 0, other_revenue: 0, acquisition_cost: 0, transfer_fees: 0, other_expenses: 0 },
    listed_withholding: 0,
    special_accounts: [],
  },
};

describe("合計所得金額は事業の損失と一時所得を通算してから1/2にする", () => {
  test("POST /api/calc/income-tax", async () => {
    const r = await requestJson("/api/calc/income-tax", {
      year: 2025,
      totalIncome: -1_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      expandedIncome: TEMP_CAMEL,
    });
    expect(r.status).toBe(200);
    expect(r.body.total_income).toBe(250_000);
  });

  test("POST /api/etax/export-xtx", async () => {
    const r = await requestJson("/api/etax/export-xtx", {
      year: 2025,
      amendment: false,
      submission_date: "2026-03-10",
      taxpayer: TAXPAYER,
      transactions: LOSS_TRANSACTIONS.map((t) => ({
        ...t,
        year: 2025,
        account: "普通預金",
        income_type: "business",
        tax_category: "",
      })),
      deductions: EMPTY_DEDUCTION_INPUTS,
      tax_credits: EMPTY_TAX_CREDIT_INPUTS,
      expanded_income: TEMP_WIRE,
      filing_type: "blue65",
      withholding_tax: 0,
      prepaid_tax: 0,
      original_third_period_tax: null,
    });
    expect(r.status).toBe(200);
    expect(String(r.body.xtx)).toContain("<ABB00410>250000</ABB00410>");
  }, 30_000);

  test("MCP の income_tax と export_xtx", async () => {
    for (const t of LOSS_TRANSACTIONS) {
      const added = await call("add_transaction", { ...t, income_type: "business" });
      expect(added.isError).toBeUndefined();
    }
    const tax = await call("income_tax", { year: 2025, expanded_income: TEMP_CAMEL });
    expect(tax.isError).toBeUndefined();
    expect(json(tax).totalIncome).toBe(250_000);

    const xtx = await call("export_xtx", { year: 2025, taxpayer: TAXPAYER, expanded_income: TEMP_CAMEL });
    expect(xtx.isError).toBeUndefined();
    expect(String(json(xtx).xtx)).toContain("<ABB00410>250000</ABB00410>");
  }, 30_000);
});

describe("MCP の XTX 出力は REST と同じ生成・XSD 検証を使う", () => {
  test("export_xtx は taxpayer を省くと保存済みプロフィールを使い、xsd_warning を返す", async () => {
    const saved = await call("save_taxpayer_profile", { year: 2025, taxpayer: TAXPAYER });
    expect(saved.isError).toBeUndefined();
    await call("add_transaction", { date: "2025-03-01", description: "売上", amount: 1_000_000, category: "売上高", income_type: "business" });
    const result = await call("export_xtx", { year: 2025 });
    expect(result.isError).toBeUndefined();
    const body = json(result);
    expect(body.filename).toBe("etax-shotoku-2025-kakutei.xtx");
    expect(body).toHaveProperty("xsd_warning");
    expect(String(body.xtx)).toContain("<NOZEISHA_NM ID=\"NOZEISHA_NM\">テスト太郎</NOZEISHA_NM>");
  }, 30_000);

  test("export_consumption_xtx は事業区分ごとの売上を受け、REST と同じ合計税額とファイル名を返す", async () => {
    const args = {
      taxpayer: TAXPAYER,
      period_from: "2025-01-01",
      period_to: "2025-12-31",
      submission_date: "2026-03-10",
      base_period_sales_thousands: 9_000,
      method: "simplified",
      sales_by_category: { "1": { incl_10: 1_100_000, incl_8: 0 }, "5": { incl_10: 1_100_000, incl_8: 0 } },
    };
    const mcp = await call("export_consumption_xtx", args);
    expect(mcp.isError).toBeUndefined();
    const rest = await requestJson("/api/etax/export-consumption-xtx", {
      ...args,
      filing_kind: 1,
      sales_incl_10: 0,
      sales_incl_8: 0,
      nontaxable_sales: 0,
      exempt_sales: 0,
      purchases_incl_10: 0,
      purchases_incl_8: 0,
      interim_national: 0,
      interim_local: 0,
      original_national: null,
      original_local: null,
    });
    expect(rest.status).toBe(200);
    const body = json(mcp);
    expect(body.filename).toBe(rest.body.filename);
    expect(body.total_payable).toBe(rest.body.total_payable);
    expect(body.xsd_warning).toBe(rest.body.xsd_warning);
    expect(body.xtx).toBe(rest.body.xtx);
    // 第1種（90%）と第5種（50%）の2事業: 付表5-3 に事業区分ごとの売上が出る
    expect(String(body.xtx)).toContain("<DVD00060>");
    expect(String(body.xtx)).toContain("<DVD00300>");
  }, 30_000);

  test("export_consumption_xtx は taxpayer を省くと課税期間の年の保存済みプロフィールを使う", async () => {
    await call("save_taxpayer_profile", { year: 2025, taxpayer: TAXPAYER });
    const result = await call("export_consumption_xtx", {
      period_from: "2025-01-01",
      period_to: "2025-12-31",
      base_period_sales_thousands: 5_000,
      sales_incl_10: 1_100_000,
      purchases_incl_10: 550_000,
    });
    expect(result.isError).toBeUndefined();
    expect(String(json(result).xtx)).toContain("テスト太郎");
  }, 30_000);

  test("export_consumption_xtx は課税期間が無ければ、保存済みプロフィールを探さずに period_from の不備を返す", async () => {
    await call("save_taxpayer_profile", { year: 2025, taxpayer: TAXPAYER });
    const result = await call("export_consumption_xtx", { period_to: "2025-12-31", base_period_sales_thousands: 5_000 });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("period_from");
  });
});

describe("REST の XTX 出力の減価償却明細", () => {
  const body = (extra: Record<string, unknown>) => ({
    year: 2025,
    amendment: false,
    submission_date: "2026-03-10",
    taxpayer: TAXPAYER,
    transactions: [
      {
        date: "2025-03-01",
        year: 2025,
        description: "売上",
        amount: 3_000_000,
        account: "普通預金",
        category: "売上高",
        income_type: "business",
        tax_category: "",
      },
    ],
    deductions: EMPTY_DEDUCTION_INPUTS,
    tax_credits: EMPTY_TAX_CREDIT_INPUTS,
    filing_type: "blue65",
    withholding_tax: 0,
    prepaid_tax: 0,
    original_third_period_tax: null,
    ...extra,
  });

  beforeEach(async () => {
    const registered = await call("register_fixed_asset", {
      name: "台帳のノートPC",
      acquisition_date: "2025-04-01",
      cost: 300_000,
      useful_life_years: 4,
    });
    expect(registered.isError).toBeUndefined();
  });

  test("fixed_assets を送らなければ、MCP と同じく固定資産台帳から明細を載せる", async () => {
    const r = await requestJson("/api/etax/export-xtx", body({}));
    expect(r.status).toBe(200);
    expect(String(r.body.xtx)).toContain("台帳のノートPC");
    const mcp = await call("export_xtx", { year: 2025, taxpayer: TAXPAYER });
    expect(String(json(mcp).xtx)).toContain("台帳のノートPC");
  }, 30_000);

  test("fixed_assets を送ったら、その資産だけを載せる", async () => {
    const r = await requestJson(
      "/api/etax/export-xtx",
      body({
        fixed_assets: [
          {
            name: "送ったカメラ",
            income_type: "business",
            acquisition_date: "2025-01-10",
            cost: 200_000,
            useful_life_years: 5,
            method: "straight_line",
            business_ratio_percent: 100,
          },
        ],
      }),
    );
    expect(r.status).toBe(200);
    expect(String(r.body.xtx)).toContain("送ったカメラ");
    expect(String(r.body.xtx)).not.toContain("台帳のノートPC");
  }, 30_000);
});
