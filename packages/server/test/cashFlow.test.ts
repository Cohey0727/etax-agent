/**
 * cashFlow.test.ts — 資金繰りレポート（Issue #19）の結合テスト。
 *
 * HTTP（GET /api/cash-flow）と MCP（get_cash_flow_report）が同じ結果を
 * 返すこと、未消込請求書の積み上げ（期日超過は当月・一部消込は残額・
 * 消込済みは除外・期日未設定は別枠）、削除済み取引の除外、テナント
 * 分離、パラメータ検証を担保する。日付は実行時点の当月（Asia/Tokyo）
 * から相対的に組み立て、実行日に依存しないようにする。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { addMonthsToMonth } from "@etax/shared";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import {
  insertInvoice,
  markInvoiceIssued,
} from "../src/repositories/invoiceRepository";
import { insertReconciliation } from "../src/repositories/reconciliationRepository";
import {
  deleteTransactionRow,
  insertTransactionRow,
} from "../src/repositories/transactionRepository";
import { createApiKey, createUser } from "../src/repositories/userRepository";
import type { Db } from "../src/lib/db";

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

const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
const currentMonth = today.slice(0, 7);
const prevMonth = addMonthsToMonth(currentMonth, -1);
const nextMonth = addMonthsToMonth(currentMonth, 1);

const ISSUER = {
  name: "山田太郎",
  zip_code: "100-0001",
  address: "東京都千代田区千代田1-1",
  invoice_number: "T1234567890123",
};

async function seedInvoice(
  db: Db,
  userId: number,
  input: { dueDate: string | null; unitPrice: number; number: string },
) {
  return runWithTenant(userId, async () => {
    const created = await insertInvoice(
      db,
      {
        issue_date: `${currentMonth}-01`,
        due_date: input.dueDate,
        counterparty_name: "株式会社テスト商事",
        counterparty_address: "東京都港区芝公園4-2-8",
        is_qualified: true,
        tax_rounding: "floor",
        memo: "",
      },
      [
        {
          item_name: "開発支援費",
          quantity: 1,
          unit: "式",
          unit_price: input.unitPrice,
          tax_rate_percent: 10,
          is_reduced_rate: false,
        },
      ],
      null,
    );
    if (!created) return null;
    return markInvoiceIssued(db, created.id, input.number, ISSUER);
  });
}

async function seedTransaction(
  db: Db,
  userId: number,
  input: { date: string; amount: number; description: string },
) {
  return runWithTenant(userId, () =>
    insertTransactionRow(db, {
      date: input.date,
      fiscalYear: Number(input.date.slice(0, 4)),
      description: input.description,
      amount: input.amount,
      account: "普通預金",
      category: input.amount >= 0 ? "売上高" : "消耗品費",
      incomeType: "business",
      taxCategory: "",
    }),
  );
}

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

async function httpGet(path: string, key: string): Promise<HttpResult> {
  const res = await appFetch(
    new Request(`http://localhost${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

interface McpResponse {
  status: number;
  body: {
    result?: {
      tools?: { name: string }[];
      content?: { type: string; text: string }[];
      isError?: boolean;
    };
  };
}

async function mcp(
  method: string,
  params: Record<string, unknown>,
  key: string,
): Promise<McpResponse> {
  const res = await appFetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const body = (await res.json().catch(() => ({}))) as McpResponse["body"];
  return { status: res.status, body };
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  key: string,
): Promise<McpResponse> {
  return mcp("tools/call", { name, arguments: args }, key);
}

function toolJson(res: McpResponse): Record<string, unknown> {
  const text = res.body.result?.content?.[0]?.text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

type MonthRow = {
  month: string;
  actual_inflow: number;
  actual_outflow: number;
  scheduled_inflow: number;
  closing_balance: number;
};

describe("資金繰りレポート", () => {
  test("HTTP と MCP で同じ結果になり、予定の積み上げ規則が効く", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "cashflow-a@example.com", "password-123");
    const keyA = (await createApiKey(db, userA.id, "a")).key;

    // 実績: 先月 +100,000 / 当月 +200,000 と -50,000
    await seedTransaction(db, userA.id, { date: `${prevMonth}-15`, amount: 100000, description: "先月の売上" });
    await seedTransaction(db, userA.id, { date: `${currentMonth}-10`, amount: 200000, description: "当月の売上" });
    await seedTransaction(db, userA.id, { date: `${currentMonth}-12`, amount: -50000, description: "消耗品の購入" });
    // 削除済み取引は実績に含めない
    const deleted = await seedTransaction(db, userA.id, {
      date: `${currentMonth}-05`,
      amount: 999999,
      description: "削除する取引",
    });
    if (deleted) {
      await runWithTenant(userA.id, () => deleteTransactionRow(db, deleted.id));
    }

    // 請求書: 翌月期日・未入金 110,000 / 先月期日・期日超過 55,000 /
    // 期日未設定 33,000 / 翌月期日・一部消込（残額 50,000）/ 消込済み（対象外）
    await seedInvoice(db, userA.id, { dueDate: `${nextMonth}-28`, unitPrice: 100000, number: "2026-0001" });
    await seedInvoice(db, userA.id, { dueDate: `${prevMonth}-28`, unitPrice: 50000, number: "2026-0002" });
    await seedInvoice(db, userA.id, { dueDate: null, unitPrice: 30000, number: "2026-0003" });
    const partial = await seedInvoice(db, userA.id, {
      dueDate: `${nextMonth}-28`,
      unitPrice: 100000,
      number: "2026-0004",
    });
    const paid = await seedInvoice(db, userA.id, {
      dueDate: `${nextMonth}-28`,
      unitPrice: 20000,
      number: "2026-0005",
    });
    if (!partial || !paid) throw new Error("請求書の発行に失敗");
    const partialPayment = await seedTransaction(db, userA.id, {
      date: `${currentMonth}-20`,
      amount: 60000,
      description: "一部入金",
    });
    const fullPayment = await seedTransaction(db, userA.id, {
      date: `${currentMonth}-21`,
      amount: 22000,
      description: "全額入金",
    });
    if (!partialPayment || !fullPayment) throw new Error("入金取引の登録に失敗");
    await runWithTenant(userA.id, async () => {
      await insertReconciliation(db, {
        document: partial,
        paymentTransaction: partialPayment,
        amount: 60000,
        feeAmount: 0,
        discountAmount: 0,
        excessAsDeposit: 0,
      });
      await insertReconciliation(db, {
        document: paid,
        paymentTransaction: fullPayment,
        amount: 22000,
        feeAmount: 0,
        discountAmount: 0,
        excessAsDeposit: 0,
      });
    });

    const query = `from=${prevMonth}&months=4&opening_balance=1000`;
    const http = await httpGet(`/api/cash-flow?${query}`, keyA);
    expect(http.status).toBe(200);
    const months = http.body["months"] as MonthRow[];
    expect(months.map((m) => m.month)).toEqual([
      prevMonth,
      currentMonth,
      nextMonth,
      addMonthsToMonth(currentMonth, 2),
    ]);
    // 先月: 実績のみ
    expect(months[0]?.actual_inflow).toBe(100000);
    expect(months[0]?.scheduled_inflow).toBe(0);
    // 当月: 実績（入金取引 60,000 + 22,000 を含む。削除済みは含まない）＋期日超過 55,000
    expect(months[1]?.actual_inflow).toBe(282000);
    expect(months[1]?.actual_outflow).toBe(50000);
    expect(months[1]?.scheduled_inflow).toBe(55000);
    // 翌月: 未入金 110,000 ＋ 一部消込の残額 50,000（消込済み 22,000 の請求書は含まない）
    expect(months[2]?.scheduled_inflow).toBe(160000);
    expect(http.body["overdue_amount"]).toBe(55000);
    expect(http.body["total_scheduled_inflow"]).toBe(215000);
    const undated = http.body["undated_receipts"] as { remaining_amount: number }[];
    expect(undated).toHaveLength(1);
    expect(undated[0]?.remaining_amount).toBe(33000);
    const upcoming = http.body["upcoming_receipts"] as { document_number: string }[];
    expect(upcoming.map((r) => r.document_number)).toEqual(["2026-0002", "2026-0001", "2026-0004"]);
    // 残高: 1,000 + 100,000 + (282,000-50,000+55,000) + 160,000 + 0
    expect(http.body["projected_closing_balance"]).toBe(548000);
    expect(months[3]?.closing_balance).toBe(548000);

    // MCP でも同じ結果（経路でずれない）
    const list = await mcp("tools/list", {}, keyA);
    const names = (list.body.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain("get_cash_flow_report");
    const viaMcp = toolJson(
      await callTool(
        "get_cash_flow_report",
        { from_month: prevMonth, months: 4, opening_balance: 1000 },
        keyA,
      ),
    );
    expect(viaMcp["projected_closing_balance"]).toBe(http.body["projected_closing_balance"]);
    expect(viaMcp["total_scheduled_inflow"]).toBe(http.body["total_scheduled_inflow"]);
    expect(viaMcp["months"]).toEqual(http.body["months"]);
  });

  test("テナント分離: 他ユーザーの取引・請求書は混ざらない", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "cashflow-iso-a@example.com", "password-123");
    const userB = await createUser(db, "cashflow-iso-b@example.com", "password-456");
    const keyB = (await createApiKey(db, userB.id, "b")).key;
    await seedTransaction(db, userA.id, {
      date: `${currentMonth}-10`,
      amount: 500000,
      description: "Aの売上",
    });
    await seedInvoice(db, userA.id, { dueDate: `${nextMonth}-28`, unitPrice: 100000, number: "2026-0001" });

    const http = await httpGet(`/api/cash-flow?from=${currentMonth}&months=3`, keyB);
    expect(http.status).toBe(200);
    expect(http.body["total_actual_inflow"]).toBe(0);
    expect(http.body["total_scheduled_inflow"]).toBe(0);
    expect(http.body["upcoming_receipts"]).toEqual([]);
    const viaMcp = toolJson(await callTool("get_cash_flow_report", {}, keyB));
    expect(viaMcp["total_actual_inflow"]).toBe(0);
    expect(viaMcp["upcoming_receipts"]).toEqual([]);
  });

  test("パラメータ検証: 不正な months / from / opening_balance はエラー", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "cashflow-valid@example.com", "password-123");
    const key = (await createApiKey(db, user.id, "v")).key;

    expect((await httpGet("/api/cash-flow?months=25", key)).status).toBe(400);
    expect((await httpGet("/api/cash-flow?months=abc", key)).status).toBe(400);
    expect((await httpGet("/api/cash-flow?months=0", key)).status).toBe(400);
    expect((await httpGet("/api/cash-flow?from=2026-13", key)).status).toBe(400);
    expect((await httpGet("/api/cash-flow?opening_balance=1.5", key)).status).toBe(400);
    expect((await httpGet("/api/cash-flow", key)).status).toBe(200);

    const badMonths = await callTool("get_cash_flow_report", { months: 25 }, key);
    expect(badMonths.body.result?.isError).toBe(true);
    const badFrom = await callTool("get_cash_flow_report", { from_month: "2026/11" }, key);
    expect(badFrom.body.result?.isError).toBe(true);
  });
});
