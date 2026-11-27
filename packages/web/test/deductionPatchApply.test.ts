/**
 * deductionPatchApply.test.ts — エージェントの控除変更を、サーバーの保存値に
 * 当てて保存することの検証（applyDeductionPatchToSaved）。
 *
 * 担保すること:
 * - 端末のキャッシュではなく、サーバーの保存値にパッチを当てて保存する
 * - 画面の編集でまとめ保存を待っている分は、取得の前にサーバーへ送る
 * - サーバーから読めなければ保存しない
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const local = new MemoryStorage();
(globalThis as Record<string, unknown>).localStorage = local;

const { freshDeductionState } = await import("@etax/shared");
const { applyDeductionPatchToSaved, loadDeductionState, saveDeductionState } = await import(
  "../src/components/organisms/filing/DeductionPanel/deductionStorage"
);

interface Call {
  method: string;
  body: { state?: Record<string, unknown> } | undefined;
}

let calls: Call[] = [];
let serverState: unknown = null;
let serverAvailable = true;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  local.clear();
  calls = [];
  serverState = null;
  serverAvailable = true;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, body });
    if (!serverAvailable) return new Response("{}", { status: 503 });
    if (method === "PUT") {
      serverState = body.state;
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify({ year: 2025, state: serverState }), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("applyDeductionPatchToSaved", () => {
  test("端末のキャッシュが空でも、サーバーの保存値にパッチを当てる", async () => {
    serverState = {
      ...freshDeductionState(),
      salaryIncome: { revenue: 5_000_000, adjustmentEligible: false },
    };
    const ok = await applyDeductionPatchToSaved(2025, {
      deductions: { medicalExpensesPaid: 120_000 },
    });
    expect(ok).toBe(true);
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.body?.state?.salaryIncome).toEqual({ revenue: 5_000_000, adjustmentEligible: false });
    expect((put?.body?.state?.deductions as Record<string, unknown>).medicalExpensesPaid).toBe(120_000);
    expect(loadDeductionState(2025).salaryIncome.revenue).toBe(5_000_000);
  });

  test("まとめ保存を待っている画面の編集は、取得の前にサーバーへ送る", async () => {
    serverState = freshDeductionState();
    saveDeductionState(2025, { ...freshDeductionState(), filingType: "white" });
    const ok = await applyDeductionPatchToSaved(2025, { miscIncome: { income: 100_000 } });
    expect(ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["PUT", "GET", "PUT"]);
    const last = calls[2]?.body?.state;
    expect(last?.filingType).toBe("white");
    expect((last?.miscIncome as Record<string, unknown>).income).toBe(100_000);
  });

  test("サーバーから読めなければ保存しない", async () => {
    serverAvailable = false;
    const ok = await applyDeductionPatchToSaved(2025, { filingType: "white" });
    expect(ok).toBe(false);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });
});
