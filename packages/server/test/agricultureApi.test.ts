/**
 * agricultureApi.test.ts — 農業所得（Issue #24 Phase 1）の REST 結合テスト。
 *
 * 担保すること:
 * - POST /api/etax/export-xtx が agriculture（ワイヤ形式）を受け、
 *   青色では KOA240、白色では KOA120 を含む XTX を生成し、公式XSD検証を
 *   通る（xsd_warning が null）
 * - 申告書（KOA020）に農業の収入金額・所得金額が出て、合計所得へ
 *   農業所得が算入される
 * - fixed_assets の income_type=agriculture が KOA240-3 の明細になる
 * - POST /api/calc/income-tax が agriculture を受け、決算書の計算内訳を返す
 * - 農業なしでは農業様式は出ない（従来どおり）
 */
import { beforeAll, describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_TAX_CREDIT_INPUTS,
} from "@etax/shared";

process.env.DATABASE_URL ??=
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
  zip_code: "1000001",
  address: "東京都千代田区霞が関一丁目1番1号",
  address_line2: "",
  birth_date: "1980-04-01",
  phone: "090-0000-0000",
  tax_office_name: "麹町",
  tax_office_code: "01101",
  my_number: "",
  user_id: "1234567890123456",
  occupation: "農業",
  shop_name: "",
  jan1_address: "",
};

/** ワイヤ形式（snake_case）の農業所得。shared の検証サンプルと同一の数値。 */
const AGRICULTURE_WIRE = {
  farm_name: "テスト農園",
  sales_amount: 3_000_000,
  household_consumption: 120_000,
  misc_revenue: 30_000,
  produce_opening_inventory: 100_000,
  produce_closing_inventory: 150_000,
  other_opening_inventory: 40_000,
  other_closing_inventory: 60_000,
  expense_totals: {
    肥料費: 400_000,
    減価償却費: 200_000,
    雇人費: 500_000,
    地代賃借料: 240_000,
    貸倒金: 10_000,
    雑費: 20_000,
  },
  family_worker_salary: 600_000,
  family_worker_deduction: 860_000,
  bad_debt_provision_in: 15_000,
  bad_debt_provision_back: 5_000,
  cultivation_cost_deduction: 80_000,
  beef_cattle_exemption_amount: 0,
};

/** camelCase 形式の農業所得（計算API用）。 */
const AGRICULTURE_CAMEL = {
  farmName: "テスト農園",
  salesAmount: 3_000_000,
  householdConsumption: 120_000,
  miscRevenue: 30_000,
  produceOpeningInventory: 100_000,
  produceClosingInventory: 150_000,
  otherOpeningInventory: 40_000,
  otherClosingInventory: 60_000,
  expenseTotals: {
    肥料費: 400_000,
    減価償却費: 200_000,
    雇人費: 500_000,
    地代賃借料: 240_000,
    貸倒金: 10_000,
    雑費: 20_000,
  },
  familyWorkerSalary: 600_000,
  familyWorkerDeduction: 860_000,
  badDebtProvisionIn: 15_000,
  badDebtProvisionBack: 5_000,
  cultivationCostDeduction: 80_000,
  beefCattleExemptionAmount: 0,
};

function exportBody(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    year: 2025,
    amendment: false,
    submission_date: "2026-03-10",
    taxpayer: TAXPAYER,
    transactions: [],
    deductions: EMPTY_DEDUCTION_INPUTS,
    tax_credits: EMPTY_TAX_CREDIT_INPUTS,
    withholding_tax: 0,
    prepaid_tax: 0,
    original_third_period_tax: null,
    ...extra,
  };
}

describe("POST /api/etax/export-xtx（農業所得）", () => {
  test("青色では KOA240 を含むXTXを生成し、XSD検証を通る", async () => {
    const r = await requestJson(
      "POST",
      "/api/etax/export-xtx",
      exportBody({ agriculture: AGRICULTURE_WIRE, filing_type: "blue65" }),
    );
    expect(r.status).toBe(200);
    expect(r.body.xsd_warning).toBeNull();
    const xtx = r.body.xtx as string;
    expect(xtx).toContain('<KOA240 VR="8.0"');
    expect(xtx).toContain("<APF00180>3100000</APF00180>");
    // 農業のみ: 控除前所得 1,220,000 − 青色申告特別控除 650,000 = 570,000
    expect(xtx).toContain("<APF00600>570000</APF00600>");
    expect(xtx).toContain("<ABB00040>3100000</ABB00040>");
    expect(xtx).toContain("<ABB00320>570000</ABB00320>");
  }, 30_000);

  test("白色では KOA120 を含むXTXを生成し、XSD検証を通る", async () => {
    const r = await requestJson(
      "POST",
      "/api/etax/export-xtx",
      exportBody({ agriculture: AGRICULTURE_WIRE, filing_type: "white" }),
    );
    expect(r.status).toBe(200);
    expect(r.body.xsd_warning).toBeNull();
    const xtx = r.body.xtx as string;
    expect(xtx).toContain('<KOA120 VR="9.0"');
    expect(xtx).not.toContain("<KOA240");
    // 専従者控除前 1,830,000 − 専従者控除 860,000 = 970,000
    expect(xtx).toContain("<AJG00430>970000</AJG00430>");
    expect(xtx).toContain("<ABB00320>970000</ABB00320>");
  }, 30_000);

  test("農業の固定資産は KOA240-3 の減価償却明細になる", async () => {
    const r = await requestJson(
      "POST",
      "/api/etax/export-xtx",
      exportBody({
        agriculture: AGRICULTURE_WIRE,
        filing_type: "blue65",
        fixed_assets: [
          {
            name: "トラクター",
            quantity: "1台",
            income_type: "agriculture",
            acquisition_date: "2023-04-01",
            cost: 2_000_000,
            useful_life_years: 7,
            method: "straight_line",
            business_ratio_percent: 100,
          },
        ],
      }),
    );
    expect(r.status).toBe(200);
    const xtx = r.body.xtx as string;
    expect(xtx).toContain('<KOA240-3 page="3">');
    expect(xtx).toContain("<APF02050>トラクター</APF02050>");
  }, 30_000);

  test("農業なしでは農業様式は出ない", async () => {
    const r = await requestJson(
      "POST",
      "/api/etax/export-xtx",
      exportBody({ filing_type: "blue65" }),
    );
    expect(r.status).toBe(200);
    const xtx = r.body.xtx as string;
    expect(xtx).not.toContain("KOA240");
    expect(xtx).not.toContain("KOA120");
    expect(xtx).not.toContain("ABB00040");
  }, 30_000);
});

describe("POST /api/calc/income-tax（農業所得）", () => {
  test("農業の決算書計算内訳を返す", async () => {
    const r = await requestJson("POST", "/api/calc/income-tax", {
      year: 2025,
      totalIncome: 570_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
      agriculture: AGRICULTURE_CAMEL,
    });
    expect(r.status).toBe(200);
    const agriculture = r.body.agriculture as {
      revenueTotal: number;
      expensesTotal: number;
      balanceAmount: number;
    };
    expect(agriculture.revenueTotal).toBe(3_100_000);
    expect(agriculture.expensesTotal).toBe(1_270_000);
    expect(agriculture.balanceAmount).toBe(1_830_000);
  }, 30_000);

  test("農業なしでは agriculture は null", async () => {
    const r = await requestJson("POST", "/api/calc/income-tax", {
      year: 2025,
      totalIncome: 1_000_000,
      deductions: EMPTY_DEDUCTION_INPUTS,
      taxCredits: EMPTY_TAX_CREDIT_INPUTS,
    });
    expect(r.status).toBe(200);
    expect(r.body.agriculture).toBeNull();
  }, 30_000);
});
