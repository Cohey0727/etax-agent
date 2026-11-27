/**
 * xtxXsdValidation.test.ts — XTX生成時の公式XSD常時検証。
 *
 * 担保すること:
 * - 手続ID・VR から対応する公式XSDを特定できる（etaxSchemaRelativePath）
 * - 同梱XSDで検証が常時走り、正しい生成物は valid になる
 * - スキーマ違反の生成物は invalid として生成が止まる（HTTP 400）
 * - XSD未同梱（2026年分の所得税 RKO0010-260.xsd は未公開）や検証
 *   エンジン不在では、無言スキップせず理由つきの警告になる
 *
 * 検証エンジン（python3 + lxml）が無い環境では、エンジン依存の検証
 * 結果アサーションはスキップする（shared の xtxXsd.test.ts と同じ扱い）。
 */
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EMPTY_DEDUCTION_INPUTS,
  EMPTY_TAX_CREDIT_INPUTS,
} from "@etax/shared";
import {
  etaxSchemaRelativePath,
  validateXtxWithOfficialXsd,
} from "../src/services/etax/xsdValidator";

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

afterEach(() => {
  delete process.env.ETAX_XSD_DIR;
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

function exportIncomeRequest(year: number): Record<string, unknown> {
  return {
    year,
    amendment: false,
    submission_date: `${year + 1}-02-10`,
    taxpayer: TAXPAYER,
    transactions: [
      {
        date: `${year}-03-01`,
        year,
        description: "売上",
        amount: 1_000_000,
        account: "普通預金",
        category: "売上高",
        income_type: "business",
        tax_category: "",
      },
    ],
    deductions: EMPTY_DEDUCTION_INPUTS,
    tax_credits: EMPTY_TAX_CREDIT_INPUTS,
    filing_type: "blue65",
    withholding_tax: 0,
    prepaid_tax: 0,
    original_third_period_tax: null,
  };
}

/** 検証エンジンが使える環境か（unavailable の理由がエンジン不在なら false）。 */
function engineAvailable(result: Awaited<ReturnType<typeof validateXtxWithOfficialXsd>>): boolean {
  return !(result.kind === "unavailable" && /python3|lxml/.test(result.reason));
}

/** RKO0010-250.xsd を「別のルート要素しか許さない」最小スキーマに差し替えた検証用ディレクトリ。 */
function makeRejectingXsdDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "etax-xsd-reject-"));
  mkdirSync(join(dir, "shotoku"), { recursive: true });
  writeFileSync(
    join(dir, "shotoku/RKO0010-250.xsd"),
    `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
  targetNamespace="http://xml.e-tax.nta.go.jp/XSD/shotoku"
  xmlns="http://xml.e-tax.nta.go.jp/XSD/shotoku"
  elementFormDefault="qualified">
  <xs:element name="RKO9999">
    <xs:complexType><xs:sequence/></xs:complexType>
  </xs:element>
</xs:schema>
`,
  );
  return dir;
}

describe("etaxSchemaRelativePath", () => {
  test("手続IDとVRから公式XSDの相対パスを決める", () => {
    expect(etaxSchemaRelativePath(`<RKO0010 VR="25.0.1" id="RKO0010">`)).toBe(
      "shotoku/RKO0010-250.xsd",
    );
    expect(etaxSchemaRelativePath(`<RKO0010 VR="23.1.1" id="RKO0010">`)).toBe(
      "shotoku/RKO0010-231.xsd",
    );
    expect(etaxSchemaRelativePath(`<RSH0010 VR="26.0.0" id="RSH0010">`)).toBe(
      "shohi/RSH0010-260.xsd",
    );
    expect(etaxSchemaRelativePath(`<RSH0030 VR="26.0.0" id="RSH0030">`)).toBe(
      "shohi/RSH0030-260.xsd",
    );
    expect(etaxSchemaRelativePath(`<DATA>手続要素なし</DATA>`)).toBeNull();
  });
});

describe("validateXtxWithOfficialXsd", () => {
  test("同梱XSDで正しい所得税XTX（2025年分）が valid になる", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", exportIncomeRequest(2025));
    expect(r.status).toBe(200);
    const result = await validateXtxWithOfficialXsd(r.body.xtx as string);
    if (!engineAvailable(result)) {
      console.log("検証エンジンが無いためスキップ:", result);
      return;
    }
    expect(result.kind).toBe("valid");
  });

  test("2026年分の所得税はXSD未同梱のため理由つき unavailable", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", exportIncomeRequest(2026));
    expect(r.status).toBe(200);
    const result = await validateXtxWithOfficialXsd(r.body.xtx as string);
    expect(result.kind).toBe("unavailable");
    if (result.kind === "unavailable") {
      expect(result.reason).toContain("RKO0010-260.xsd");
    }
  });

  test("XSDディレクトリが無ければ理由つき unavailable（無言スキップしない）", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", exportIncomeRequest(2025));
    process.env.ETAX_XSD_DIR = join(tmpdir(), "etax-xsd-does-not-exist-xyz");
    const result = await validateXtxWithOfficialXsd(r.body.xtx as string);
    expect(result.kind).toBe("unavailable");
  });

  test("XMLとして解析できないXTXは invalid（検証エンジン不在と取り違えない）", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", exportIncomeRequest(2025));
    const broken = (r.body.xtx as string).replace("</NOZEISHA_NM>", "\u0001</NOZEISHA_NM>");
    const probe = await validateXtxWithOfficialXsd(r.body.xtx as string);
    if (!engineAvailable(probe)) {
      console.log("検証エンジンが無いためスキップ:", probe);
      return;
    }
    const result = await validateXtxWithOfficialXsd(broken);
    expect(result.kind).toBe("invalid");
  });

  test("スキーマに適合しないXTXは invalid でエラー内容が返る", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", exportIncomeRequest(2025));
    process.env.ETAX_XSD_DIR = makeRejectingXsdDir();
    const result = await validateXtxWithOfficialXsd(r.body.xtx as string);
    if (!engineAvailable(result)) {
      console.log("検証エンジンが無いためスキップ:", result);
      return;
    }
    expect(result.kind).toBe("invalid");
    if (result.kind === "invalid") expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("HTTP: XTX出力時の常時検証", () => {
  test("所得税2025年分は検証が通り xsd_warning が null", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", exportIncomeRequest(2025));
    expect(r.status).toBe(200);
    const probe = await validateXtxWithOfficialXsd(r.body.xtx as string);
    if (!engineAvailable(probe)) {
      console.log("検証エンジンが無いためスキップ:", probe);
      return;
    }
    expect(r.body.xsd_warning).toBeNull();
  });

  test("所得税2026年分は警告つきで生成が続行される", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", exportIncomeRequest(2026));
    expect(r.status).toBe(200);
    expect(typeof r.body.xsd_warning).toBe("string");
    expect(r.body.xsd_warning as string).toContain("RKO0010-260.xsd");
  });

  test("スキーマ違反になる生成物は 400 で止まる", async () => {
    process.env.ETAX_XSD_DIR = makeRejectingXsdDir();
    const probe = await requestJson("POST", "/api/etax/export-xtx", exportIncomeRequest(2025));
    if (probe.status === 200 && typeof probe.body.xsd_warning === "string" && /python3|lxml/.test(probe.body.xsd_warning)) {
      console.log("検証エンジンが無いためスキップ");
      return;
    }
    expect(probe.status).toBe(400);
    expect(probe.body.error as string).toContain("公式XMLスキーマ");
  });

  test("消費税（本則）2025年分は検証が通り xsd_warning が null", async () => {
    const r = await requestJson("POST", "/api/etax/export-consumption-xtx", {
      taxpayer: TAXPAYER,
      period_from: "2025-01-01",
      period_to: "2025-12-31",
      submission_date: "2026-02-10",
      filing_kind: 1,
      base_period_sales_thousands: 1000,
      sales_incl_10: 11_000_000,
      sales_incl_8: 0,
      nontaxable_sales: 0,
      exempt_sales: 0,
      purchases_incl_10: 5_500_000,
      purchases_incl_8: 0,
      interim_national: 0,
      interim_local: 0,
      original_national: null,
      original_local: null,
    });
    expect(r.status).toBe(200);
    const probe = await validateXtxWithOfficialXsd(r.body.xtx as string);
    if (!engineAvailable(probe)) {
      console.log("検証エンジンが無いためスキップ:", probe);
      return;
    }
    expect(r.body.xsd_warning).toBeNull();
  });

  test("消費税は方式ごとのファイル名と合計税額を返す（簡易課税・2割特例の修正申告）", async () => {
    const base = {
      taxpayer: TAXPAYER,
      period_from: "2025-01-01",
      period_to: "2025-12-31",
      submission_date: "2026-02-10",
      base_period_sales_thousands: 1000,
      sales_incl_10: 11_000_000,
      sales_incl_8: 0,
      nontaxable_sales: 0,
      exempt_sales: 0,
      purchases_incl_10: 0,
      purchases_incl_8: 0,
      interim_national: 0,
      interim_local: 0,
    };
    const simplified = await requestJson("POST", "/api/etax/export-consumption-xtx", {
      ...base,
      filing_kind: 1,
      original_national: null,
      original_local: null,
      method: "simplified",
      business_category: 5,
    });
    expect(simplified.status).toBe(200);
    expect(simplified.body.filename).toBe("etax-shohi-2025-kanni-kakutei.xtx");
    // 第5種: 国税 390,000 + 地方 110,000
    expect(simplified.body.total_payable).toBe(500_000);
    expect(simplified.body.xtx as string).toContain('<RSH0030 VR="26.0.0"');

    const special20 = await requestJson("POST", "/api/etax/export-consumption-xtx", {
      ...base,
      filing_kind: 3,
      original_national: 0,
      original_local: 0,
      method: "special20",
    });
    expect(special20.status).toBe(200);
    expect(special20.body.filename).toBe("etax-shohi-2025-special20-shusei.xtx");
    // 国税 780,000 × 20% = 156,000 + 地方 44,000
    expect(special20.body.total_payable).toBe(200_000);
    expect(special20.body.xtx as string).toContain("<AAM00020><kubun_CD>8</kubun_CD></AAM00020>");
  });

  test("貸借対照表に不明な勘定キーがあれば、キー名つきの 400 になる（貸借不一致と取り違えない）", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", {
      ...exportIncomeRequest(2025),
      balance_sheet: {
        opening: { cahs: 1_000_000, capital: 1_000_000 },
        closing: { cash: 1_000_000 },
        owner_loan: 0,
        owner_borrowing: 0,
      },
    });
    expect(r.status).toBe(400);
    expect(r.body.error as string).toContain("cahs");
    expect(r.body.error as string).not.toContain("貸借一致");
  });

  test("固定資産の償却計算に失敗したら、どの資産かが分かる 400 になる", async () => {
    const r = await requestJson("POST", "/api/etax/export-xtx", {
      ...exportIncomeRequest(2025),
      fixed_assets: [
        {
          name: "車両",
          income_type: "business",
          acquisition_date: "2025-04-01",
          cost: 600_000,
          useful_life_years: 0,
          method: "straight_line",
          business_ratio_percent: 100,
        },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.body.error as string).toContain("固定資産「車両」の減価償却計算に失敗しました");
  });
});
