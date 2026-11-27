/**
 * youngDependentApi.test.ts — 「23歳未満の扶養親族がいる」（生命保険料控除の特例）を
 * REST の所得税計算が受け取ることの検証。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { EMPTY_DEDUCTION_INPUTS, EMPTY_TAX_CREDIT_INPUTS } from "@etax/shared";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
delete process.env.ETAX_AUTH_MODE;

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
});

async function lifeInsuranceDeduction(hasDependentUnder23: boolean): Promise<number> {
  const res = await appFetch(
    new Request("http://localhost/api/calc/income-tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: 2026,
        totalIncome: 5_000_000,
        deductions: {
          ...EMPTY_DEDUCTION_INPUTS,
          lifeInsurance: { ...EMPTY_DEDUCTION_INPUTS.lifeInsurance, newGeneral: 200_000 },
          hasDependentUnder23,
        },
        taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      }),
    }),
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { deductions: { lifeInsurance: number } };
  return body.deductions.lifeInsurance;
}

describe("23歳未満の扶養親族がいる場合の生命保険料控除（令和8年分）", () => {
  test("hasDependentUnder23 を受け取り、一般生命保険料の控除の上限を引き上げる", async () => {
    const withYoung = await lifeInsuranceDeduction(true);
    const without = await lifeInsuranceDeduction(false);
    expect(without).toBe(40_000);
    expect(withYoung).toBe(60_000);
  });
});
