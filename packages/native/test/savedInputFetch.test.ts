import { json, stubFetch } from "./nativeMocks";
import { describe, expect, test } from "bun:test";

const { fetchBusinessStartInputsResult, fetchFilingInputsResult, fetchTaxpayerProfileResult } =
  await import("../src/api/filing");

describe("申告入力の取得結果", () => {
  test("保存値があれば saved", async () => {
    stubFetch(() => json(200, { year: 2025, state: { filingType: "white" }, updated_at: "x" }));
    expect(await fetchFilingInputsResult(2025)).toEqual({
      kind: "saved",
      value: { filingType: "white" },
    });
  });

  test("サーバーが state:null を返したときだけ unsaved", async () => {
    stubFetch(() => json(200, { year: 2025, state: null, updated_at: null }));
    expect(await fetchFilingInputsResult(2025)).toEqual({ kind: "unsaved" });
  });

  test("503・401・通信失敗・JSON でない応答は failed（未保存と読まない）", async () => {
    stubFetch(() => json(503, { error: "データベースが設定されていません" }));
    expect(await fetchFilingInputsResult(2025)).toEqual({ kind: "failed" });
    stubFetch(() => json(401, { error: "ログインが必要です" }));
    expect(await fetchFilingInputsResult(2025)).toEqual({ kind: "failed" });
    stubFetch(() => {
      throw new TypeError("Network request failed");
    });
    expect(await fetchFilingInputsResult(2025)).toEqual({ kind: "failed" });
    stubFetch(() => new Response("<html>login</html>", { status: 200 }));
    expect(await fetchFilingInputsResult(2025)).toEqual({ kind: "failed" });
  });
});

describe("納税者プロフィールの取得結果", () => {
  test("プロフィール（引き継ぎを含む）は saved", async () => {
    const taxpayer = { name: "山田太郎" };
    stubFetch(() => json(200, { taxpayer, carried_from: 2024 }));
    expect(await fetchTaxpayerProfileResult(2025)).toEqual({
      kind: "saved",
      value: { taxpayer, carried_from: 2024 },
    });
  });

  test("取得できなければ failed（空のプロフィールとして扱わない）", async () => {
    stubFetch(() => json(503, { error: "x" }));
    expect(await fetchTaxpayerProfileResult(2025)).toEqual({ kind: "failed" });
    stubFetch(() => json(200, {}));
    expect(await fetchTaxpayerProfileResult(2025)).toEqual({ kind: "failed" });
  });
});

describe("開業入力の取得結果", () => {
  test("state:null は unsaved、失敗は failed", async () => {
    stubFetch(() => json(200, { state: null, updated_at: null }));
    expect(await fetchBusinessStartInputsResult()).toEqual({ kind: "unsaved" });
    stubFetch(() => json(500, { error: "x" }));
    expect(await fetchBusinessStartInputsResult()).toEqual({ kind: "failed" });
    stubFetch(() => json(200, { state: { start_date: "2025-04-01" }, updated_at: "x" }));
    expect(await fetchBusinessStartInputsResult()).toEqual({
      kind: "saved",
      value: { start_date: "2025-04-01" },
    });
  });
});
