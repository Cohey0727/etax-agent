/**
 * consumptionWiring.test.ts — 消費税3方式の比較（REST・MCP・エージェント）が、
 * shared の compareConsumptionMethods と同じ規則で計算することの検証。
 *
 * - 小規模事業者の特例は年分の率（令和8年分まで2割、令和9・10年分は個人事業者の3割）。
 *   特例の無い年分は出さない
 * - 簡易課税は事業区分のみなし仕入率（既定は第5種）
 * - 納付税額は国税分（100円未満切捨て）と地方消費税（国税分×22/78）の合計
 *
 * 売上（税込）15,000,000 の令和9年分: 売上税額 1,063,608 − 控除 744,525 = 319,083
 * → 国税 319,000 + 地方 89,900 = 408,900。
 */
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Transaction } from "@etax/shared";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import { createUser } from "../src/repositories/userRepository";
import { dispatchTool } from "../src/services/agent/agentTools";
import { McpToolResult } from "../src/services/mcp/mcpToolKit";
import { dispatchMcpTool } from "../src/services/mcp/mcpTools";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
delete process.env.ETAX_AUTH_MODE;

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;
let userId: number;

beforeAll(async () => {
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
});

beforeEach(async () => {
  const db = await createTestDb();
  userId = (await createUser(db, "consumption-wiring@example.com", "password-123")).id;
});

function sales(year: number): Transaction {
  return {
    date: `${year}-03-01`,
    year,
    description: "売上",
    amount: 15_000_000,
    account: "普通預金",
    category: "売上高",
    income_type: "business",
    tax_category: "",
  };
}

interface MethodResult {
  method: string;
  payable: number;
  detail: Record<string, unknown>;
}

async function postConsumption(json: unknown): Promise<Record<string, unknown>> {
  const res = await appFetch(
    new Request("http://localhost/api/calc/consumption", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

function mcp(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  return runWithTenant(userId, () => dispatchMcpTool(name, args));
}

function mcpJson(result: McpToolResult): Record<string, unknown> {
  expect(result.isError).toBeUndefined();
  return JSON.parse(result.content[0]?.text ?? "") as Record<string, unknown>;
}

describe("POST /api/calc/consumption", () => {
  test("令和9年分は3割特例、簡易課税は business_kind のみなし仕入率、国税分と地方分の合計が納付税額", async () => {
    const body = await postConsumption({ transactions: [sales(2027)], year: 2027, business_kind: "retail" });
    expect(body.small_business_special_rate).toBe(0.3);
    const results = body.results as (MethodResult & { nationalPayable: number; localPayable: number })[];
    const special = results.find((r) => r.method === "special20");
    expect(special?.payable).toBe(408_900);
    expect(special?.detail.special_rate).toBe(0.3);
    expect(results.find((r) => r.method === "simplified")?.detail.deemed_purchase_rate).toBe(0.8);
    for (const r of results) expect(r.nationalPayable + r.localPayable).toBe(r.payable);
  });

  test("特例の無い年分は特例の方式を出さない", async () => {
    const body = await postConsumption({ transactions: [sales(2022)], year: 2022 });
    expect(body.small_business_special_rate).toBeNull();
    const methods = (body.results as MethodResult[]).map((r) => r.method);
    expect(methods).toEqual(["standard", "simplified"]);
  });
});

describe("MCP の consumption_tax", () => {
  test("年分の特例の率と business_kind を使い、国税分・地方分を返す", async () => {
    const added = await mcp("add_transaction", {
      date: "2027-03-01",
      description: "売上",
      amount: 15_000_000,
      category: "売上高",
      income_type: "business",
    });
    expect(added.isError).toBeUndefined();
    const body = mcpJson(await mcp("consumption_tax", { year: 2027, business_kind: "retail" }));
    expect(body.small_business_special_rate).toBe(0.3);
    const methods = body.methods as (MethodResult & { national_payable: number; local_payable: number })[];
    const special = methods.find((r) => r.method === "special20");
    expect(special?.payable).toBe(408_900);
    expect(special?.national_payable).toBe(319_000);
    expect(special?.local_payable).toBe(89_900);
    expect(methods.find((r) => r.method === "simplified")?.detail.deemed_purchase_rate).toBe(0.8);
  });
});

describe("エージェントの consumption_tax", () => {
  test("令和9年分の特例は3割で計算し、business_kind を簡易課税に使う", () => {
    const ctx = { transactions: [sales(2027)] };
    const special = dispatchTool("consumption_tax", { year: 2027, method: "special20" }, ctx) as Record<string, unknown>;
    expect(special.payable).toBe(408_900);
    expect(special.national_payable).toBe(319_000);
    expect(special.local_payable).toBe(89_900);
    const simplified = dispatchTool(
      "consumption_tax",
      { year: 2027, method: "simplified", business_kind: "retail" },
      ctx,
    ) as Record<string, unknown>;
    expect((simplified.detail as Record<string, unknown>).deemed_purchase_rate).toBe(0.8);
  });

  test("特例の無い年分に特例を求めたら、計算せずにエラーを返す", () => {
    const result = dispatchTool("consumption_tax", { year: 2022, method: "special20" }, { transactions: [sales(2022)] }) as Record<string, unknown>;
    expect(String(result.error)).toContain("特例");
  });
});
