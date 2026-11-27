/**
 * receiptRegistration.test.ts — 領収書から帳簿への登録の検証。
 *
 * 担保すること:
 * - 登録は取引1件の追加で行い、年度の置き換え（replace-year）を使わない
 *   （置き換えると既存取引の id が変わり、証憑・消込の紐付けが外れる）
 * - 解析した証憑を、追加した取引へ紐付ける
 * - 帳簿DBが無い（503）ときは保存せず、画面の取引にだけ加える
 */
import { Transaction } from "@etax/shared";
import { afterEach, describe, expect, test } from "bun:test";
import { registerReceiptTransaction } from "../src/components/organisms/receipt/ReceiptPanel/ReceiptPanel.utils";

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const mockFetch = (respond: (call: Call) => Response): Call[] => {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = {
      method: init?.method ?? "GET",
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return calls;
};

const tx: Transaction = {
  date: "2026-11-20",
  year: 2026,
  description: "文具店 ボールペン",
  amount: -1100,
  account: "領収書画像",
  category: "消耗品費",
  income_type: "business",
  tax_category: "課対仕入10%",
};

const createdRow = {
  id: 42,
  date: "2026-11-20",
  fiscal_year: 2026,
  description: "文具店 ボールペン",
  amount: -1100,
  account: "領収書画像",
  category: "消耗品費",
  income_type: "business",
  tax_category: "課対仕入10%",
  business_ratio_percent: 100,
  business_ratio_basis: "",
  import_id: null,
  created_at: "2026-11-20T00:00:00.000Z",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("registerReceiptTransaction", () => {
  test("取引を1件追加し、解析した証憑をその取引へ紐付ける", async () => {
    const calls = mockFetch((call) =>
      call.url === "/api/transactions"
        ? json(201, { transaction: createdRow })
        : json(200, { receipt: { file_id: "file-1", transaction_id: 42 } }),
    );
    const result = await registerReceiptTransaction(tx, "file-1");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/transactions",
      "POST /api/receipts/file-1/link",
    ]);
    expect(calls.some((c) => c.url.includes("replace-year"))).toBe(false);
    expect(calls[1]?.body).toEqual({ transaction_id: 42 });
    expect(result).toEqual({
      transaction: { ...tx, business_ratio_percent: 100, business_ratio_basis: "" },
      persisted: true,
      linked: true,
    });
  });

  test("証憑が無い（Base64 で解析した）ときは紐付けない", async () => {
    const calls = mockFetch(() => json(201, { transaction: createdRow }));
    const result = await registerReceiptTransaction(tx, null);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/transactions"]);
    expect(result.linked).toBe(false);
  });

  test("帳簿DBが無い（503）ときは画面の取引にだけ加える", async () => {
    mockFetch(() => json(503, { error: "DATABASE_URL が未設定です" }));
    const result = await registerReceiptTransaction(tx, "file-1");
    expect(result).toEqual({ transaction: tx, persisted: false, linked: false });
  });

  test("503 以外の保存失敗はそのまま投げる", async () => {
    mockFetch(() => json(400, { error: "date は YYYY-MM-DD 形式で指定してください" }));
    await expect(registerReceiptTransaction(tx, "file-1")).rejects.toThrow(
      "date は YYYY-MM-DD 形式で指定してください",
    );
  });
});
