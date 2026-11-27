/**
 * filingInputsLoad.test.ts — 申告入力・納税者情報・開業届の入力の読み込みで、
 * 取得失敗を未保存と取り違えてサーバーの保存値を上書きしないことの検証。
 *
 * 担保すること:
 * - 取得に失敗したら、端末の値をサーバーへ送らず、読み込み失敗として返す
 * - 未保存（state: null）のときだけ、端末の値をサーバーへ送る
 * - 納税者情報は、端末の値を一度送った年分では、その後サーバーで空にしても
 *   端末の値で上書きし直さない
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

const { hydrateDeductionStateFromServer, loadDeductionState } = await import(
  "../src/components/organisms/filing/DeductionPanel/deductionStorage"
);
const { emptyTaxpayer, loadTaxpayer } = await import(
  "../src/components/organisms/filing/TaxpayerProfilePanel/taxpayerStorage"
);
const { loadBusinessStartInputs } = await import(
  "../src/components/organisms/filing/hooks/useBusinessStartInputs/businessStartStorage"
);

interface Call {
  method: string;
  url: string;
  body: unknown;
}

let calls: Call[] = [];
const originalFetch = globalThis.fetch;

/** GET には routes の応答（無ければ 503）、PUT には 200 を返す fetch に差し替える。 */
function mockFetch(routes: Record<string, { status: number; body?: unknown }>): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method !== "GET") return new Response("{}", { status: 200 });
    const route = routes[url] ?? { status: 503, body: { error: "unavailable" } };
    return new Response(JSON.stringify(route.body ?? {}), { status: route.status });
  }) as typeof fetch;
}

beforeEach(() => {
  local.clear();
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("申告入力（hydrateDeductionStateFromServer）", () => {
  test("取得に失敗したら端末の値を送らず、失敗として返す", async () => {
    local.setItem("etax-amend-deductions-2025", JSON.stringify({ filingType: "white" }));
    mockFetch({});
    const result = await hydrateDeductionStateFromServer(2025);
    expect(result).toBe(false);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  test("未保存なら端末の値をサーバーへ送る", async () => {
    local.setItem("etax-amend-deductions-2025", JSON.stringify({ filingType: "white" }));
    mockFetch({ "/api/filing-inputs/2025": { status: 200, body: { year: 2025, state: null } } });
    const result = await hydrateDeductionStateFromServer(2025);
    expect(result).toBe(true);
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("/api/filing-inputs/2025");
    expect(put?.body).toEqual({ state: { filingType: "white" } });
  });

  test("保存値があればそれを端末のキャッシュへ取り込む", async () => {
    mockFetch({
      "/api/filing-inputs/2025": { status: 200, body: { year: 2025, state: { filingType: "blue55" } } },
    });
    const result = await hydrateDeductionStateFromServer(2025);
    expect(result).toBe(true);
    expect(loadDeductionState(2025).filingType).toBe("blue55");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });
});

describe("納税者情報（loadTaxpayer）", () => {
  const saved = { ...emptyTaxpayer(), name: "山田太郎", address: "東京都千代田区" };

  test("取得に失敗したら端末の値を送らず、null を返す", async () => {
    local.setItem("etax-taxpayer-2025", JSON.stringify(saved));
    mockFetch({});
    expect(await loadTaxpayer(2025)).toBeNull();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  test("端末の値を送った年分は、その後サーバーで空にしても端末の値で上書きしない", async () => {
    local.setItem("etax-taxpayer-2025", JSON.stringify(saved));
    const empty = { taxpayer: emptyTaxpayer(), carried_from: null };
    mockFetch({ "/api/taxpayer/2025": { status: 200, body: empty } });

    const first = await loadTaxpayer(2025);
    expect(first?.taxpayer.name).toBe("山田太郎");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);

    calls = [];
    const second = await loadTaxpayer(2025);
    expect(second?.taxpayer.name).toBe("");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });
});

describe("開業届の入力（loadBusinessStartInputs）", () => {
  test("取得失敗・未保存・保存済みを区別して返す", async () => {
    mockFetch({});
    expect((await loadBusinessStartInputs()).status).toBe("failed");

    mockFetch({ "/api/business-start-inputs": { status: 200, body: { state: null, updated_at: null } } });
    expect((await loadBusinessStartInputs()).status).toBe("empty");

    mockFetch({
      "/api/business-start-inputs": {
        status: 200,
        body: { state: { start_date: "2025-04-01" }, updated_at: "2025-04-02T00:00:00.000Z" },
      },
    });
    const loaded = await loadBusinessStartInputs();
    expect(loaded.status).toBe("loaded");
    if (loaded.status === "loaded") {
      expect(loaded.value.start_date).toBe("2025-04-01");
      expect(loaded.value.offices).toHaveLength(2);
    }
  });
});
