/**
 * expandedIncomeApi.test.ts — 拡張所得（配当・一時・株式等譲渡、Issue #27）の
 * REST 結合テスト。
 *
 * 担保すること:
 * - POST /api/calc/income-tax が expandedIncome を受け、総合課税分への
 *   加算・配当控除の対象額の解決・申告分離課税まで一貫して計算する
 * - POST /api/etax/export-xtx が expanded_income（ワイヤ形式）を受け、
 *   第三表＋計算明細書（KOC080）を含む XTX を生成し、源泉徴収税額へ
 *   拡張分を自動加算する
 */
import { beforeAll, describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_TAX_CREDIT_INPUTS,
} from "@etax/shared";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
delete process.env.ETAX_AUTH_MODE;
delete process.env.ETAX_XSD_DIR;

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
});

async function requestJson(
  method: string,
  path: string,
  json?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await appFetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
    }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

const TAXPAYER = {
  name: "テスト太郎",
  name_kana: "テストタロウ",
  zip_code: "7220062",
  address: "広島県尾道市向東町3567-1",
  address_line2: "",
  birth_date: "1980-04-01",
  phone: "080-2500-7879",
  tax_office_name: "尾道",
  tax_office_code: "08121",
  my_number: "",
  user_id: "1234567890123456",
  occupation: "システムエンジニア",
  shop_name: "",
  jan1_address: "",
};

/** camelCase 形式の拡張所得（計算API用）。数値は shared の検証サンプルと同一。 */
const EXPANDED_CAMEL = {
  temp: { revenue: 1_500_000, expenses: 300_000 },
  dividend: {
    listedRevenue: 800_000,
    listedTrustRevenue: 0,
    listedWithholding: 122_520,
    listedMode: "separate",
    generalRevenue: 200_000,
    generalTrustRevenue: 0,
    generalWithholding: 40_840,
    interestExpense: 100_000,
  },
  stocks: {
    general: { revenue: 1_000_000, otherRevenue: 0, acquisitionCost: 600_000, transferFees: 0, otherExpenses: 0 },
    listed: { revenue: 500_000, otherRevenue: 0, acquisitionCost: 900_000, transferFees: 0, otherExpenses: 0 },
    listedWithholding: 0,
    specialAccounts: [
      { brokerName: "テスト証券", branchName: "本店", withholdingAccount: true, revenue: 2_000_000, cost: 1_900_000, withholding: 15_315 },
    ],
  },
};

/** snake_case ワイヤ形式の拡張所得（XTX出力API用）。 */
const EXPANDED_WIRE = {
  temp: { revenue: 1_500_000, expenses: 300_000 },
  dividend: {
    listed_revenue: 800_000,
    listed_trust_revenue: 0,
    listed_withholding: 122_520,
    listed_mode: "separate",
    general_revenue: 200_000,
    general_trust_revenue: 0,
    general_withholding: 40_840,
    interest_expense: 100_000,
  },
  stocks: {
    general: { revenue: 1_000_000, other_revenue: 0, acquisition_cost: 600_000, transfer_fees: 0, other_expenses: 0 },
    listed: { revenue: 500_000, other_revenue: 0, acquisition_cost: 900_000, transfer_fees: 0, other_expenses: 0 },
    listed_withholding: 0,
    special_accounts: [
      { broker_name: "テスト証券", branch_name: "本店", withholding_account: true, revenue: 2_000_000, cost: 1_900_000, withholding: 15_315 },
    ],
  },
};

describe("POST /api/calc/income-tax（拡張所得）", () => {
  test("配当・一時・株式等譲渡を通算し、分離課税と配当控除まで一貫する", async () => {
    const r = await requestJson("POST", "/api/calc/income-tax", {
      year: 2025,
      totalIncome: 1_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      expandedIncome: EXPANDED_CAMEL,
    });
    expect(r.status).toBe(200);
    // 総合課税分 = 1,000,000 + 配当の総合分180,000 + 一時の1/2算入350,000
    expect(r.body.total_income).toBe(1_530_000);
    expect(r.body.grand_total_income).toBe(2_350_000);
    // 上場譲渡損失300,000は申告分離の上場配当720,000と通算 → 420,000
    expect(r.body.taxable_separate_stocks).toBe(400_000);
    expect(r.body.taxable_separate_dividends).toBe(420_000);
    expect(r.body.income_tax_separate_stocks).toBe(60_000);
    expect(r.body.income_tax_separate_dividends).toBe(63_000);
    // 配当控除は配当の内訳から導出した対象額180,000の10%（手入力は0）
    const credits = r.body.tax_credits as { dividend: number };
    expect(credits.dividend).toBe(18_000);
    const expanded = r.body.expanded_income as {
      stocks: { general: { income: number } };
      listedLossOffsetToDividend: number;
    };
    expect(expanded.stocks.general.income).toBe(400_000);
    expect(expanded.listedLossOffsetToDividend).toBe(300_000);
  }, 30_000);

  test("拡張所得なしでは分離課税フィールドは0で内訳は null", async () => {
    const r = await requestJson("POST", "/api/calc/income-tax", {
      year: 2025,
      totalIncome: 1_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(r.status).toBe(200);
    expect(r.body.taxable_separate_stocks).toBe(0);
    expect(r.body.income_tax_separate_total).toBe(0);
    expect(r.body.expanded_income).toBeNull();
    expect(r.body.grand_total_income).toBe(1_000_000);
  }, 30_000);
});

describe("POST /api/etax/export-xtx（拡張所得）", () => {
  test("第三表と計算明細書を含むXTXを生成し、源泉徴収へ拡張分を加算する", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", {
      year: 2025,
      amendment: false,
      submission_date: "2026-03-10",
      taxpayer: TAXPAYER,
      transactions: [
        {
          date: "2025-03-01",
          year: 2025,
          description: "売上",
          amount: 12_000_000,
          account: "普通預金",
          category: "売上高",
          income_type: "business",
          tax_category: "",
        },
      ],
      deductions: EMPTY_DEDUCTION_INPUTS,
      tax_credits: EMPTY_TAX_CREDIT_INPUTS,
      expanded_income: EXPANDED_WIRE,
      filing_type: "blue65",
      withholding_tax: 0,
      prepaid_tax: 0,
      original_third_period_tax: null,
    });
    expect(r.status).toBe(200);
    const xtx = String(r.body.xtx ?? "");
    expect(xtx).toContain("<KOA020-3");
    expect(xtx).toContain("<KOC080 ");
    expect(xtx).toContain("<ABL00500>400000</ABL00500>");
    expect(xtx).toContain("<ABL00505>420000</ABL00505>");
    // 源泉徴収税額 = 配当163,360 + 特定口座15,315 = 178,675
    expect(xtx).toContain("<ABB00710>178675</ABB00710>");
  }, 30_000);
});
