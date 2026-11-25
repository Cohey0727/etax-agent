/**
 * mcpReconciliation.test.ts — 請求書・入金消込の MCP ツールの HTTP 結合テスト。
 *
 * mcp.test.ts と同じ方式（テスト DB を指してアプリを import し、JSON-RPC を
 * 直接投げる）で、次を担保する:
 *   - tools/list に請求書・消込ツールが含まれる
 *   - 候補推測は提示だけで確定せず、create の明示呼び出しで初めて消込される
 *   - 二重消込はエラーになる
 *   - テナント分離: 他ユーザーのキーでは請求書も消込も見えない・できない
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import {
  insertInvoice,
  markInvoiceIssued,
} from "../src/repositories/invoiceRepository";
import { createApiKey, createUser } from "../src/repositories/userRepository";

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
      tools?: { name: string }[];
      content?: { type: string; text: string }[];
      isError?: boolean;
    };
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

async function callTool(
  name: string,
  args: Record<string, unknown>,
  key: string,
): Promise<McpResponse> {
  return mcp("tools/call", { name, arguments: args }, key);
}

describe("請求書・入金消込の MCP ツール", () => {
  test("候補推測→明示的な消込→解除の流れとテナント分離", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "mcp-recon-a@example.com", "password-123");
    const userB = await createUser(db, "mcp-recon-b@example.com", "password-456");
    const keyA = (await createApiKey(db, userA.id, "a")).key;
    const keyB = (await createApiKey(db, userB.id, "b")).key;

    // ツール一覧に含まれる
    const list = await mcp("tools/list", {}, keyA);
    const names = (list.body.result?.tools ?? []).map((t) => t.name);
    for (const name of [
      "list_invoices",
      "get_invoice",
      "list_invoice_payments",
      "suggest_invoice_payments",
      "create_invoice_payment",
      "delete_invoice_payment",
    ]) {
      expect(names).toContain(name);
    }

    // A の入金取引を MCP で登録
    const added = await callTool(
      "add_transaction",
      {
        date: "2026-03-15",
        description: "振込 カ）テストシヨウジ",
        amount: 110000,
        category: "売上高",
        income_type: "business",
      },
      keyA,
    );
    expect(added.body.result?.isError).toBeUndefined();
    const txList = toolJson(await callTool("list_transactions", {}, keyA));
    const transactions = txList["transactions"] as { id: number }[];
    const transactionId = transactions[0]?.id ?? 0;
    expect(transactionId).toBeGreaterThan(0);

    // A の発行済み請求書を用意する（請求書の作成ツールは無いためリポジトリ経由）
    const invoice = await runWithTenant(userA.id, async () => {
      const created = await insertInvoice(
        db,
        {
          issue_date: "2026-03-01",
          due_date: "2026-03-31",
          counterparty_name: "株式会社テスト商事",
          counterparty_address: "東京都港区芝公園4-2-8",
          is_qualified: true,
          tax_rounding: "floor",
          memo: "",
        },
        [
          {
            item_name: "Webサイト制作費",
            quantity: 1,
            unit: "式",
            unit_price: 100000,
            tax_rate_percent: 10,
            is_reduced_rate: false,
          },
        ],
        null,
      );
      if (!created) return null;
      return markInvoiceIssued(db, created.id, "2026-0001", {
        name: "山田太郎",
        zip_code: "100-0001",
        address: "東京都千代田区千代田1-1",
        invoice_number: "T1234567890123",
      });
    });
    if (!invoice) throw new Error("請求書の発行に失敗");

    // B からは請求書が見えない
    const listB = toolJson(await callTool("list_invoices", {}, keyB));
    expect(listB["invoices"]).toEqual([]);
    const getB = await callTool("get_invoice", { invoice_id: invoice.id }, keyB);
    expect(getB.body.result?.isError).toBe(true);

    // 候補推測は提示だけで、消込はまだ確定していない
    const suggested = toolJson(
      await callTool("suggest_invoice_payments", { invoice_id: invoice.id }, keyA),
    );
    const candidates = suggested["candidates"] as {
      transaction: { id: number };
      suggested_amount: number;
    }[];
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.transaction.id).toBe(transactionId);
    expect(candidates[0]?.suggested_amount).toBe(110000);
    const before = toolJson(
      await callTool("list_invoice_payments", { invoice_id: invoice.id }, keyA),
    );
    expect((before["settlement"] as { status: string }).status).toBe("unpaid");

    // B は A の請求書へ消込できない
    const createB = await callTool(
      "create_invoice_payment",
      { invoice_id: invoice.id, transaction_id: transactionId },
      keyB,
    );
    expect(createB.body.result?.isError).toBe(true);

    // A が明示的に消込すると確定する
    const created = toolJson(
      await callTool(
        "create_invoice_payment",
        { invoice_id: invoice.id, transaction_id: transactionId },
        keyA,
      ),
    );
    expect((created["settlement"] as { status: string }).status).toBe("paid");
    const payments = created["payments"] as { id: number }[];
    const paymentId = payments[0]?.id ?? 0;

    // 二重消込はエラー
    const duplicate = await callTool(
      "create_invoice_payment",
      { invoice_id: invoice.id, transaction_id: transactionId },
      keyA,
    );
    expect(duplicate.body.result?.isError).toBe(true);

    // list_invoices にも消込状態が反映される
    const listA = toolJson(await callTool("list_invoices", {}, keyA));
    const invoicesA = listA["invoices"] as { payment_status: string }[];
    expect(invoicesA[0]?.payment_status).toBe("paid");

    // 解除すると未消込に戻る
    const released = toolJson(
      await callTool(
        "delete_invoice_payment",
        { invoice_id: invoice.id, payment_id: paymentId },
        keyA,
      ),
    );
    expect((released["settlement"] as { status: string }).status).toBe("unpaid");
  });
});
