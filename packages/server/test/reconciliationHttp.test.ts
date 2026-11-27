/**
 * reconciliationHttp.test.ts — 入金消込エンドポイントの HTTP 結合テスト。
 *
 * ルーティングとステータス（201/200/400/404）を通して、候補推測→作成→
 * 解除の流れと、請求書一覧への消込状態の反映を担保する。
 * アプリ本体は DATABASE_URL を見て DB プールを作るため、import 前に
 * テスト DB を指させる（httpIntegration.test.ts と同じ方式）。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import {
  insertInvoice,
  markInvoiceIssued,
} from "../src/repositories/invoiceRepository";
import { insertTransactionRow } from "../src/repositories/transactionRepository";

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

describe("入金消込エンドポイント", () => {
  test("候補推測→消込作成（201）→二重消込は400→解除（200）", async () => {
    const db = await createTestDb();
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
    const invoice = await markInvoiceIssued(db, created?.id ?? 0, "2026-0001", {
      name: "山田太郎",
      zip_code: "100-0001",
      address: "東京都千代田区千代田1-1",
      invoice_number: "T1234567890123",
    });
    if (!invoice) throw new Error("請求書の発行に失敗");
    const income = await insertTransactionRow(db, {
      date: "2026-03-15",
      fiscalYear: 2026,
      description: "振込 カ）テストシヨウジ",
      amount: 110000,
      account: "普通預金",
      category: "売上高",
      incomeType: "business",
      taxCategory: "",
      businessRatioPercent: 100,
      businessRatioBasis: "",
    });
    if (!income) throw new Error("入金取引の登録に失敗");

    const before = await req(`/api/invoices/${invoice.id}/payments`);
    expect(before.status).toBe(200);
    expect((before.body["settlement"] as { status: string }).status).toBe("unpaid");

    const suggestions = await req(`/api/invoices/${invoice.id}/payment-suggestions`);
    expect(suggestions.status).toBe(200);
    expect(suggestions.body["candidates"]).toHaveLength(1);

    const createdPayment = await req(`/api/invoices/${invoice.id}/payments`, {
      method: "POST",
      json: { transaction_id: income.id },
    });
    expect(createdPayment.status).toBe(201);
    expect((createdPayment.body["settlement"] as { status: string }).status).toBe("paid");
    const payments = createdPayment.body["payments"] as { id: number }[];
    const paymentId = payments[0]?.id ?? 0;

    // 請求書一覧にも消込状態が反映される
    const list = await req("/api/invoices");
    const invoices = list.body["invoices"] as { id: number; payment_status: string }[];
    expect(invoices.find((row) => row.id === invoice.id)?.payment_status).toBe("paid");

    // 二重消込は 400、存在しない請求書は 404
    const duplicate = await req(`/api/invoices/${invoice.id}/payments`, {
      method: "POST",
      json: { transaction_id: income.id },
    });
    expect(duplicate.status).toBe(400);
    const missing = await req("/api/invoices/99999999/payments", {
      method: "POST",
      json: { transaction_id: income.id },
    });
    expect(missing.status).toBe(404);

    const released = await req(`/api/invoices/${invoice.id}/payments/${paymentId}`, {
      method: "DELETE",
    });
    expect(released.status).toBe(200);
    expect((released.body["settlement"] as { status: string }).status).toBe("unpaid");
  });
});
