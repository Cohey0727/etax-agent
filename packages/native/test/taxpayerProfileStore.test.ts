import { json, stubFetch } from "./nativeMocks";
import { describe, expect, test } from "bun:test";

const { taxpayerProfileStore } = await import("../src/features/filing/taxpayerData");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("納税者プロフィールのストア", () => {
  test("取得できなければ failed にし、空のプロフィールで始めない", async () => {
    const calls = stubFetch(() => json(503, { error: "データベースに接続できません" }));
    const entry = await taxpayerProfileStore.refresh(3, 2025);
    expect(entry).toEqual({ status: "failed" });
    taxpayerProfileStore.update(3, 2025, (p) => ({ ...p, taxpayer: { ...p.taxpayer, phone: "090" } }));
    await sleep(700);
    expect(calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  test("編集は読み込んだ他の項目を残したまま保存し、別の画面からも同じ値が見える", async () => {
    const calls = stubFetch((call) =>
      call.method === "PUT"
        ? json(200, { taxpayer: call.body })
        : json(200, { taxpayer: { name: "山田太郎", address: "東京都千代田区" }, carried_from: 2024 }),
    );
    const entry = await taxpayerProfileStore.refresh(3, 2026);
    expect(entry.status === "ready" ? entry.value.carriedFrom : null).toBe(2024);
    taxpayerProfileStore.update(3, 2026, (p) => ({ ...p, taxpayer: { ...p.taxpayer, phone: "090" } }));
    const seen = taxpayerProfileStore.get(3, 2026);
    expect(seen.status === "ready" ? seen.value.taxpayer.phone : null).toBe("090");
    await sleep(700);
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toMatchObject({ name: "山田太郎", address: "東京都千代田区", phone: "090" });
  });
});
