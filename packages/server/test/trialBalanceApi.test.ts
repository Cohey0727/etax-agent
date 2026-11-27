/**
 * trialBalanceApi.test.ts — POST /api/calc/trial-balance の結合テスト（Issue #18）。
 *
 * 試算表は stateless な計算系 API のため DB は使わないが、アプリ本体の
 * import 前にテスト DB を指させる（httpIntegration と同じ前文）。
 */
import { beforeAll, describe, expect, test } from "bun:test";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
delete process.env.ETAX_AUTH_MODE;

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
});

async function postTrialBalance(
  json: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await appFetch(
    new Request("http://localhost/api/calc/trial-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

const TRANSACTIONS = [
  {
    date: "2023-02-01",
    year: 2023,
    description: "売上",
    amount: 3_000_000,
    account: "普通預金",
    category: "売上高",
    income_type: "business",
    tax_category: "",
  },
  {
    date: "2023-02-02",
    year: 2023,
    description: "通信費",
    amount: -200_000,
    account: "普通預金",
    category: "通信費",
    income_type: "business",
    tax_category: "",
  },
  {
    date: "2022-05-01",
    year: 2022,
    description: "前年の売上",
    amount: 1_000_000,
    account: "普通預金",
    category: "売上高",
    income_type: "business",
    tax_category: "",
  },
];

describe("POST /api/calc/trial-balance", () => {
  test("当年と前年の試算表を返す", async () => {
    const r = await postTrialBalance({ transactions: TRANSACTIONS, year: 2023 });
    expect(r.status).toBe(200);
    expect(r.body.year).toBe(2023);
    const business = r.body.business as Record<string, unknown>;
    expect(business.revenue).toBe(3_000_000);
    expect(business.expenses).toBe(200_000);
    expect(business.income_before_blue).toBe(2_800_000);
    const monthly = r.body.monthly as { month: number; revenue: number }[];
    expect(monthly).toHaveLength(12);
    expect(monthly[1]?.revenue).toBe(3_000_000);
    expect(r.body.balance_sheet).toBeNull();

    const previous = r.body.previous as Record<string, unknown>;
    expect(previous.year).toBe(2022);
    const prevBusiness = previous.business as Record<string, unknown>;
    expect(prevBusiness.revenue).toBe(1_000_000);
  });

  test("貸借対照表入力がある場合は balance_sheet が返る", async () => {
    const r = await postTrialBalance({
      transactions: TRANSACTIONS,
      year: 2023,
      balance_sheet: {
        opening: { capital: 500_000, cash: 500_000 },
        closing: { cash: 500_000 + 2_800_000 },
        owner_loan: 0,
        owner_borrowing: 0,
      },
    });
    expect(r.status).toBe(200);
    const bs = r.body.balance_sheet as Record<string, unknown>;
    expect(bs.opening_balanced).toBe(true);
    expect(bs.closing_balanced).toBe(true);
    expect(bs.closing_assets).toBe(3_300_000);
  });

  test("year が無いと 400", async () => {
    const r = await postTrialBalance({ transactions: TRANSACTIONS });
    expect(r.status).toBe(400);
  });
});

describe("POST /api/calc/trial-balance の農業所得", () => {
  test("保存済みの申告入力の農業所得を渡すと、青色申告特別控除を XTX（決算書）と同じに配分する", async () => {
    // 事業的規模でない家賃収入だけなら不動産の控除は10万円まで。農業所得があれば65万円を不動産から配分する
    const rent = [
      {
        date: "2025-04-01",
        year: 2025,
        description: "家賃",
        amount: 1_200_000,
        account: "普通預金",
        category: "家賃収入",
        income_type: "real_estate",
        tax_category: "",
      },
    ];
    const agriculture = {
      farm_name: "",
      sales_amount: 1_500_000,
      household_consumption: 0,
      misc_revenue: 0,
      produce_opening_inventory: 0,
      produce_closing_inventory: 0,
      other_opening_inventory: 0,
      other_closing_inventory: 0,
      expense_totals: {},
      family_worker_salary: 0,
      family_worker_deduction: 0,
      bad_debt_provision_in: 0,
      bad_debt_provision_back: 0,
      cultivation_cost_deduction: 0,
      beef_cattle_exemption_amount: 0,
    };
    const without = await postTrialBalance({ transactions: rent, year: 2025 });
    expect((without.body.real_estate as Record<string, unknown>).blue_deduction).toBe(100_000);
    const r = await postTrialBalance({ transactions: rent, year: 2025, agriculture });
    expect(r.status).toBe(200);
    expect((r.body.real_estate as Record<string, unknown>).blue_deduction).toBe(650_000);
  });
});
