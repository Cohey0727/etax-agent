/**
 * apiContract.test.ts — アプリ全体を通した HTTP の約束ごとの検証。
 * 起動設定、エラー応答の形（{ error: string }）、入力検証のステータスを確かめる。
 *
 * アプリ本体（src/index.ts）は DATABASE_URL を見て DB プールを作るため、
 * import 前にテスト DB を指させる。
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { serverDataDir } from "../src/lib/config";
import { createTestDb } from "./testDb";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
delete process.env.ETAX_AUTH_MODE;

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;
let serverOptions: { idleTimeout?: number };

beforeAll(async () => {
  const mod = await import("../src/index");
  serverOptions = mod.default;
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

interface RequestInit {
  method?: string;
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
}

async function req(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { ...init.headers };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await appFetch(
    new Request(`http://localhost${path}`, { method: init.method ?? "GET", headers, body }),
  );
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: parsed };
}

describe("起動設定", () => {
  test("idleTimeout を Bun の既定（10秒）より長くする", () => {
    // エージェント対話や科目判定の外部呼び出しは 10 秒を超えることがあり、
    // 既定のままだと応答前に接続が切られる。
    expect(serverOptions.idleTimeout ?? 10).toBeGreaterThan(10);
  });
});

describe("入力検証の失敗は { error: string } の 400 で返す", () => {
  const cases: { name: string; path: string; init?: RequestInit }[] = [
    { name: "減価償却: year の欠落", path: "/api/fixed-assets/depreciation" },
    {
      name: "提出の記録: 税目が不正",
      path: "/api/filing-submissions/2025/corporate",
      init: { method: "PUT", json: { acceptance_number: "1", submitted_date: null } },
    },
    {
      name: "確定スナップショット: figures の欠落",
      path: "/api/filing-snapshots/2025",
      init: { method: "POST", json: { figures: { business_income: 1 } } },
    },
    { name: "資金繰り: from の書式", path: "/api/cash-flow?from=2025-13" },
    { name: "請求書一覧: status が不正", path: "/api/invoices?status=void" },
    {
      name: "開業入力: state の形",
      path: "/api/business-start-inputs",
      init: { method: "PUT", json: { state: { start_date: 1 } } },
    },
    {
      name: "申告入力: ボディがオブジェクトでない",
      path: "/api/filing-inputs/2025",
      init: { method: "PUT", json: [1, 2] },
    },
  ];
  for (const c of cases) {
    test(c.name, async () => {
      const r = await req(c.path, c.init);
      expect(r.status).toBe(400);
      expect(typeof r.body["error"]).toBe("string");
      expect(r.body["error"]).not.toBe("");
      expect(r.body["success"]).toBeUndefined();
    });
  }

  test("失敗した項目名を文言に含める", async () => {
    const r = await req("/api/filing-submissions/2025/corporate", {
      method: "PUT",
      json: { acceptance_number: "1", submitted_date: null },
    });
    expect(r.body["error"]).toBe("kind が不正です");
  });
});

describe("税務パラメータの無い年分は 400", () => {
  const deductions = {
    socialInsurancePaid: 0,
    smallBusinessMutualAidPaid: 0,
    lifeInsurance: { newGeneral: 0, newCareMedical: 0, newPension: 0, oldGeneral: 0, oldPension: 0 },
    earthquakeInsurance: { earthquake: 0, oldLongTerm: 0 },
    medicalExpensesPaid: 0,
    medicalReimbursement: 0,
    donationsTotal: 0,
    casualtyLoss: null,
    spouseCategory: "none",
    spouseTotalIncome: null,
    dependents: { general: 0, specific: 0, elderly: 0, elderlyCohabiting: 0 },
    disability: { general: 0, special: 0, specialCohabiting: 0 },
    isWidow: false,
    isSingleParent: false,
    isWorkingStudent: false,
    specialRelativeTotalIncome: null,
  };
  const taxCredits = {
    housingLoanBalance: 0,
    housingLoanLimit: 0,
    housingLoanRate: 0,
    dividendCorporate: 0,
    dividendTrust: 0,
    politicalDonations: 0,
    certifiedNpoDonations: 0,
    seismicRetrofitStandardCost: 0,
    seismicRetrofitOtherCost: 0,
    foreignTaxPaid: 0,
    foreignIncome: 0,
    flatReduction: 0,
  };
  const taxpayer = {
    name: "", name_kana: "", zip_code: "", address: "", address_line2: "", birth_date: "",
    phone: "", tax_office_name: "", tax_office_code: "", my_number: "", user_id: "",
    occupation: "", shop_name: "", jan1_address: "",
  };

  test("所得税額の計算", async () => {
    const r = await req("/api/calc/income-tax", {
      method: "POST",
      json: { year: 2022, totalIncome: 5_000_000, deductions, taxCredits },
    });
    expect(r.status).toBe(400);
    expect(String(r.body["error"])).toContain("対応年分");
  });

  test("所得税額の計算: 年に小数は受けない", async () => {
    const r = await req("/api/calc/income-tax", {
      method: "POST",
      json: { year: 2025.5, totalIncome: 5_000_000, deductions, taxCredits },
    });
    expect(r.status).toBe(400);
  });

  test("XTX 出力", async () => {
    const r = await req("/api/etax/export-xtx", {
      method: "POST",
      json: {
        year: 2022, amendment: false, submission_date: "2023-03-01", taxpayer,
        transactions: [], deductions, tax_credits: taxCredits,
        withholding_tax: 0, prepaid_tax: 0, original_third_period_tax: null,
      },
    });
    expect(r.status).toBe(400);
    expect(String(r.body["error"])).toContain("対応年分");
  });
});

describe("更新系リクエストの送信元検査", () => {
  const replaceBody = JSON.stringify({ year: 2025, transactions: [] });

  async function seedOne(): Promise<void> {
    await createTestDb();
    const created = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-02-01", amount: 5000, description: "売上" },
    });
    expect(created.status).toBe(201);
  }

  async function ledgerCount(): Promise<unknown> {
    return (await req("/api/transactions?year=2025")).body["count"];
  }

  test("他サイトからの text/plain の POST は処理しない", async () => {
    await seedOne();
    const r = await req("/api/transactions/replace-year", {
      method: "POST",
      body: replaceBody,
      headers: { "Content-Type": "text/plain;charset=UTF-8", Origin: "https://evil.example" },
    });
    expect(r.status).toBe(403);
    expect(typeof r.body["error"]).toBe("string");
    expect(await ledgerCount()).toBe(1);
  });

  test("他サイトからは JSON の POST・ボディ無しの POST も処理しない", async () => {
    await seedOne();
    const json = await req("/api/transactions/replace-year", {
      method: "POST",
      body: replaceBody,
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
    });
    expect(json.status).toBe(403);
    const bodiless = await req("/api/invoices/1/issue", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(bodiless.status).toBe(403);
    expect(await ledgerCount()).toBe(1);
  });

  test("同一オリジン（Host と一致・Sec-Fetch-Site）と Origin 無しは通す", async () => {
    await seedOne();
    const sameHost = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-02-02", amount: 1000, description: "a" },
      headers: { Origin: "https://app.example", Host: "app.example" },
    });
    expect(sameHost.status).toBe(201);
    const fetchSite = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-02-03", amount: 1000, description: "b" },
      headers: { Origin: "https://app.example", "Sec-Fetch-Site": "same-origin" },
    });
    expect(fetchSite.status).toBe(201);
    const noOrigin = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-02-04", amount: 1000, description: "c" },
    });
    expect(noOrigin.status).toBe(201);
    expect(await ledgerCount()).toBe(4);
  });

  test("JSON 以外の Content-Type のボディは JSON として読まない", async () => {
    await seedOne();
    const r = await req("/api/transactions/replace-year", {
      method: "POST",
      body: replaceBody,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
    expect(r.status).toBe(400);
    expect(r.body["error"]).toBe("JSONボディが必要です");
    expect(await ledgerCount()).toBe(1);
  });
});

describe("数値パラメータの不正は DB に渡さず 400 で返す", () => {
  test("取引一覧: year が数値でない", async () => {
    const r = await req("/api/transactions?year=abc");
    expect(r.status).toBe(400);
    expect(r.body["error"]).toBe("year が不正です");
  });

  test("取引の更新: id が integer の範囲外", async () => {
    const r = await req("/api/transactions/99999999999", { method: "PUT", json: { description: "x" } });
    expect(r.status).toBe(400);
    expect(r.body["error"]).toBe("id が不正です");
  });

  test("請求書の取得: id が integer の範囲外", async () => {
    const r = await req("/api/invoices/99999999999");
    expect(r.status).toBe(400);
  });

  test("年度置換: 取引ごとの fiscal_year が範囲外なら置換対象の年にする", async () => {
    await createTestDb();
    const r = await req("/api/transactions/replace-year", {
      method: "POST",
      json: { year: 2025, transactions: [{ date: "2025-01-01", amount: 1, fiscal_year: 3_000_000_000 }] },
    });
    expect(r.status).toBe(200);
    const rows = r.body["transactions"] as { fiscal_year: number }[];
    expect(rows[0]?.fiscal_year).toBe(2025);
  });

  test("確定スナップショット: ボディ無しの POST", async () => {
    const r = await req("/api/filing-snapshots/2025", { method: "POST" });
    expect(r.status).toBe(400);
  });

  test("資金繰り: months は固有の文言で返す", async () => {
    const r = await req("/api/cash-flow?months=abc");
    expect(r.status).toBe(400);
    expect(r.body["error"]).toBe("months は1〜24の整数で指定してください");
  });
});

describe("DB エラーと壊れた保存データの応答", () => {
  test("DB の型に合わない入力は 400 で返し、SQL を応答に含めない", async () => {
    await createTestDb();
    const r = await req("/api/fixed-assets", {
      method: "POST",
      json: { name: "PC", acquisition_date: "2025-04-01", cost: 3_000_000_000, useful_life_years: 4 },
    });
    expect(r.status).toBe(400);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain("Failed query");
    expect(text).not.toContain("params:");
    expect(text).not.toContain("fixed_assets");
  });

  test("開業入力: 保存値が JSON として壊れていれば未保存として返す", async () => {
    const db = await createTestDb();
    const saved = await req("/api/business-start-inputs", { method: "GET" });
    expect(saved.status).toBe(200);
    await db.execute(
      sql`insert into business_start_inputs (owner_user_id, state, updated_at) values (1, '{broken', now())`,
    );
    const r = await req("/api/business-start-inputs");
    expect(r.status).toBe(200);
    expect(r.body["state"]).toBeNull();
  });

  test("freee 試算表: ファイルが壊れていれば理由を示す", async () => {
    await writeFile(join(serverDataDir(), "freee-trial-balance.json"), "{broken", "utf-8");
    const r = await req("/api/freee/trial-balance");
    expect(r.status).toBe(500);
    expect(String(r.body["error"])).toContain("freee");
  });
});

describe("取引・固定資産の日付と収入区分", () => {
  test("暦に無い日付の取引は登録・更新できない", async () => {
    await createTestDb();
    const bad = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-13-45", amount: 1000, description: "x" },
    });
    expect(bad.status).toBe(400);
    const leap = await req("/api/transactions", {
      method: "POST",
      json: { date: "2024-02-29", amount: 1000, description: "閏日" },
    });
    expect(leap.status).toBe(201);
    const id = (leap.body["transaction"] as { id: number }).id;
    const updated = await req(`/api/transactions/${id}`, { method: "PUT", json: { date: "2025-02-29" } });
    expect(updated.status).toBe(400);
  });

  test("暦に無い取得日の固定資産は登録できない", async () => {
    await createTestDb();
    const r = await req("/api/fixed-assets", {
      method: "POST",
      json: { name: "PC", acquisition_date: "2025-13-01", cost: 300000, useful_life_years: 4 },
    });
    expect(r.status).toBe(400);
  });

  test("未知の収入区分は「その他」として保存し、null も拒否しない", async () => {
    await createTestDb();
    const unknown = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-03-01", amount: 1000, description: "a", income_type: "Business" },
    });
    expect(unknown.status).toBe(201);
    expect((unknown.body["transaction"] as { income_type: string }).income_type).toBe("other");
    const nullType = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-03-01", amount: 1000, description: "b", income_type: null },
    });
    expect(nullType.status).toBe(201);
    const known = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-03-01", amount: 1000, description: "c", income_type: "real_estate" },
    });
    expect((known.body["transaction"] as { income_type: string }).income_type).toBe("real_estate");
  });
});

describe("取引の更新: 金額の型違い", () => {
  test("amount が数値でなければ 400 で、金額は変わらない", async () => {
    await createTestDb();
    const created = await req("/api/transactions", {
      method: "POST",
      json: { date: "2025-02-01", amount: 1000, description: "a" },
    });
    const id = (created.body["transaction"] as { id: number }).id;
    const r = await req(`/api/transactions/${id}`, { method: "PUT", json: { amount: "5000" } });
    expect(r.status).toBe(400);
    expect(r.body["error"]).toBe("amount は数値で指定してください");
    const listed = await req("/api/transactions?year=2025");
    const rows = listed.body["transactions"] as { amount: number }[];
    expect(rows[0]?.amount).toBe(1000);
  });
});

describe("ボディの上限", () => {
  test("上限を超えたボディは理由を示す 413", async () => {
    const big = JSON.stringify({ transactions: [], pad: "a".repeat(26 * 1024 * 1024) });
    const r = await req("/api/calc/aggregate", {
      method: "POST",
      body: big,
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status).toBe(413);
    expect(String(r.body["error"])).not.toBe("");
  });
});
