import { asyncStorage, json, stubFetch } from "./nativeMocks";
import { beforeEach, describe, expect, test } from "bun:test";

const { hydrateDeductionStateFromServer } = await import("../src/features/filing/deductionState");

const CACHE_KEY = (year: number) => `etax-deductions-7-${year}`;

beforeEach(() => {
  asyncStorage.clear();
});

describe("申告入力の取り込み", () => {
  test("取得に失敗したら、端末キャッシュをサーバーへ送らずに失敗を返す", async () => {
    asyncStorage.set(CACHE_KEY(2025), JSON.stringify({ filingType: "white" }));
    const calls = stubFetch(() => json(503, { error: "データベースに接続できません" }));
    await expect(hydrateDeductionStateFromServer(7, 2025)).rejects.toThrow();
    expect(calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  test("サーバーが未保存なら、端末にだけある入力をサーバーへ送って使う", async () => {
    asyncStorage.set(CACHE_KEY(2024), JSON.stringify({ filingType: "white" }));
    const calls = stubFetch((call) =>
      call.method === "PUT" ? json(200, { ok: true }) : json(200, { year: 2024, state: null }),
    );
    const state = await hydrateDeductionStateFromServer(7, 2024);
    expect(state.filingType).toBe("white");
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect((puts[0]?.body as { state: { filingType: string } }).state.filingType).toBe("white");
  });

  test("保存値があればそれを使い、端末キャッシュへ写す", async () => {
    stubFetch(() => json(200, { year: 2023, state: { filingType: "blue10" } }));
    const state = await hydrateDeductionStateFromServer(7, 2023);
    expect(state.filingType).toBe("blue10");
    expect(JSON.parse(asyncStorage.get(CACHE_KEY(2023)) ?? "{}")).toEqual({ filingType: "blue10" });
  });
});
