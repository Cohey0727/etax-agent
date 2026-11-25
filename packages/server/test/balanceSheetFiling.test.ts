/**
 * balanceSheetFiling.test.ts — 貸借対照表入力の保存→読み出し→試算表→
 * XTX出力の往復テスト（Issue #18 残件：貸借対照表の入力UI）。
 *
 * 貸借対照表は申告入力（filing_inputs）の年度別 state にドメイン形式
 * （XtxBalanceSheetInput）で保存するのが正で、API へは balanceSheetToWire
 * で変換して渡す。この一連が実HTTPで往復することを確認する。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_TAX_CREDIT_INPUTS,
  balanceSheetToWire,
  type XtxBalanceSheetInput,
} from "@etax/shared";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
delete process.env.ETAX_AUTH_MODE;

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

const YEAR = 2025;

// 事業売上 1,000,000 のみ。青色申告特別控除前の事業所得は 1,000,000。
const TRANSACTIONS = [
  {
    date: "2025-03-01",
    year: YEAR,
    description: "売上",
    amount: 1_000_000,
    account: "普通預金",
    category: "売上高",
    income_type: "business",
    tax_category: "",
  },
];

// 期首：現金 500,000 = 元入金 500,000
// 期末：現金 1,500,000 = 元入金 500,000 + 所得 1,000,000（貸借一致）
const BALANCE_SHEET: XtxBalanceSheetInput = {
  opening: { cash: 500_000, capital: 500_000 },
  closing: { cash: 1_500_000 },
  ownerLoan: 0,
  ownerBorrowing: 0,
};

describe("貸借対照表入力の往復", () => {
  test("申告入力として保存→読み出しで貸借対照表が往復する", async () => {
    const state = { filingType: "blue65", balanceSheet: BALANCE_SHEET };
    const put = await requestJson("PUT", `/api/filing-inputs/${YEAR}`, { state });
    expect(put.status).toBe(200);
    const get = await requestJson("GET", `/api/filing-inputs/${YEAR}`);
    expect(get.status).toBe(200);
    const saved = get.body.state as { balanceSheet: XtxBalanceSheetInput };
    expect(saved.balanceSheet).toEqual(BALANCE_SHEET);
  });

  test("保存した貸借対照表を試算表APIへ渡すとBS表示データが返る", async () => {
    const get = await requestJson("GET", `/api/filing-inputs/${YEAR}`);
    const saved = (get.body.state as { balanceSheet: XtxBalanceSheetInput }).balanceSheet;
    const r = await requestJson("POST", "/api/calc/trial-balance", {
      transactions: TRANSACTIONS,
      year: YEAR,
      balance_sheet: balanceSheetToWire(saved),
    });
    expect(r.status).toBe(200);
    const bs = r.body.balance_sheet as Record<string, unknown>;
    expect(bs.opening_assets).toBe(500_000);
    expect(bs.closing_assets).toBe(1_500_000);
    expect(bs.capital).toBe(500_000);
    expect(bs.income_before_blue).toBe(1_000_000);
    expect(bs.opening_balanced).toBe(true);
    expect(bs.closing_balanced).toBe(true);
  });

  test("保存した貸借対照表がXTX出力（KOA210-4）に反映される", async () => {
    const get = await requestJson("GET", `/api/filing-inputs/${YEAR}`);
    const saved = (get.body.state as { balanceSheet: XtxBalanceSheetInput }).balanceSheet;
    const r = await requestJson("POST", "/api/etax/export-xtx", {
      year: YEAR,
      amendment: false,
      submission_date: "2026-02-10",
      taxpayer: {
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
      },
      transactions: TRANSACTIONS,
      deductions: EMPTY_DEDUCTION_INPUTS,
      tax_credits: EMPTY_TAX_CREDIT_INPUTS,
      filing_type: "blue65",
      withholding_tax: 0,
      prepaid_tax: 0,
      original_third_period_tax: null,
      balance_sheet: balanceSheetToWire(saved),
    });
    expect(r.status).toBe(200);
    const xtx = r.body.xtx as string;
    expect(xtx).toContain("<KOA210-4");
    expect(xtx).toContain("<AMG00060>500000</AMG00060>"); // 現金（期首）
    expect(xtx).toContain("<AMG00230>500000</AMG00230>"); // 期首の資産合計
    expect(xtx).toContain("<AMG00260>1500000</AMG00260>"); // 現金（期末）
    expect(xtx).toContain("<AMG00440>1500000</AMG00440>"); // 期末の資産合計
    expect(xtx).toContain("<AMG00740>500000</AMG00740>"); // 元入金（期末欄も期首額）
    expect(xtx).toContain("<AMG00750>1000000</AMG00750>"); // 所得金額（青色控除前）
    expect(xtx).toContain("<AMG00760>1500000</AMG00760>"); // 期末の負債・資本合計
  });
});
