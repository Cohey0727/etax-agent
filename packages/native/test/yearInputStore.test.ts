import { describe, expect, test } from "bun:test";
import {
  YearInputLoadResult,
  createYearInputStore,
} from "../src/features/filing/yearInputStore";

interface Inputs {
  filingType: string;
  socialInsurance: number;
}

const SAVED: Inputs = { filingType: "blue65", socialInsurance: 100 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setup(load: () => Promise<YearInputLoadResult<Inputs>>) {
  const saves: Inputs[] = [];
  const store = createYearInputStore<Inputs>({
    load,
    save: async (_userId, _year, value) => {
      saves.push(value);
      return true;
    },
    saveDelayMs: 5,
  });
  return { store, saves };
}

describe("年度別入力のストア", () => {
  test("取得に失敗したら failed のままにし、変更も保存もしない", async () => {
    const { store, saves } = setup(async () => ({ kind: "failed" }));
    await store.refresh(1, 2025);
    expect(store.get(1, 2025)).toEqual({ status: "failed" });
    store.update(1, 2025, (s) => ({ ...s, socialInsurance: 1 }));
    await sleep(20);
    expect(saves).toEqual([]);
    expect(await store.modify(1, 2025, (s) => ({ ...s, socialInsurance: 1 }))).toBe(false);
    expect(saves).toEqual([]);
  });

  test("別々の画面の変更を同じ値に重ね、古い写しで上書きしない", async () => {
    const { store, saves } = setup(async () => ({ kind: "loaded", value: SAVED }));
    await store.refresh(1, 2025);
    // 納税者情報画面で申告の種類を変える
    store.update(1, 2025, (s) => ({ ...s, filingType: "white" }));
    // Stack に残っていた確定申告画面で控除を変える
    store.update(1, 2025, (s) => ({ ...s, socialInsurance: 200 }));
    await sleep(20);
    expect(store.get(1, 2025)).toEqual({
      status: "ready",
      value: { filingType: "white", socialInsurance: 200 },
    });
    expect(saves).toEqual([{ filingType: "white", socialInsurance: 200 }]);
  });

  test("保存が終わっていない変更は、読み直した値で上書きしない", async () => {
    let release: (value: YearInputLoadResult<Inputs>) => void = () => undefined;
    let calls = 0;
    const { store } = setup(() => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ kind: "loaded", value: SAVED });
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    await store.refresh(1, 2025);
    const reloading = store.refresh(1, 2025);
    store.update(1, 2025, (s) => ({ ...s, socialInsurance: 300 }));
    release({ kind: "loaded", value: SAVED });
    await reloading;
    expect(store.get(1, 2025)).toEqual({
      status: "ready",
      value: { filingType: "blue65", socialInsurance: 300 },
    });
  });

  test("modify は読み込みを待ってから変更し、待たずに保存する", async () => {
    const { store, saves } = setup(async () => ({ kind: "loaded", value: SAVED }));
    const ok = await store.modify(1, 2025, (s) => ({ ...s, socialInsurance: 140_080 }));
    expect(ok).toBe(true);
    expect(saves).toEqual([{ filingType: "blue65", socialInsurance: 140_080 }]);
    expect(store.get(1, 2025)).toEqual({
      status: "ready",
      value: { filingType: "blue65", socialInsurance: 140_080 },
    });
  });

  test("失敗のあとに読み直すと、読み込み中を経て値が入る", async () => {
    let fail = true;
    const { store } = setup(async () => (fail ? { kind: "failed" } : { kind: "loaded", value: SAVED }));
    await store.refresh(1, 2025);
    fail = false;
    const retrying = store.refresh(1, 2025);
    expect(store.get(1, 2025)).toEqual({ status: "loading" });
    await retrying;
    expect(store.get(1, 2025)).toEqual({ status: "ready", value: SAVED });
  });

  test("ユーザーと年度ごとに別の値を持つ", async () => {
    const { store } = setup(async () => ({ kind: "loaded", value: SAVED }));
    await store.refresh(1, 2025);
    store.update(1, 2025, (s) => ({ ...s, socialInsurance: 1 }));
    expect(store.get(2, 2025)).toEqual({ status: "loading" });
    expect(store.get(1, 2024)).toEqual({ status: "loading" });
  });
});
