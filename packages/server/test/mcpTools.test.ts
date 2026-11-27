/**
 * mcpTools.test.ts — MCP ツールの実行関数（dispatchMcpTool）の単体寄りの検証。
 *
 * HTTP を介さず、テナント文脈を載せて dispatchMcpTool を直接呼ぶ。
 * 引数の検証・REST と揃えるべき既定の挙動・失敗時の結果の形を担保する。
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import { Db } from "../src/lib/db";
import { DEFAULT_OWNER_ID, runWithTenant } from "../src/lib/tenantContext";
import { createUser } from "../src/repositories/userRepository";
import { listTransactionRows } from "../src/repositories/transactionRepository";
import { McpToolResult } from "../src/services/mcp/mcpToolKit";
import { dispatchMcpTool } from "../src/services/mcp/mcpTools";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;

let db: Db;
let userId: number;

function call(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  return runWithTenant(userId, () => dispatchMcpTool(name, args));
}

function text(result: McpToolResult): string {
  return result.content[0]?.text ?? "";
}

function json(result: McpToolResult): Record<string, unknown> {
  return JSON.parse(text(result)) as Record<string, unknown>;
}

beforeEach(async () => {
  process.env.ETAX_DATA_DIR = await mkdtemp(join(tmpdir(), "etax-mcp-tools-"));
  db = await createTestDb();
  userId = (await createUser(db, "mcp-tools@example.com", "password-123")).id;
});

describe("add_transaction / update_transaction の学習の記録", () => {
  test("学習履歴に記録できなくても、取引の保存は成功として返す", async () => {
    // データフォルダの位置にファイルを置き、学習履歴の書き込みを失敗させる
    const blocked = join(process.env.ETAX_DATA_DIR!, "not-a-directory");
    await writeFile(blocked, "");
    process.env.ETAX_DATA_DIR = blocked;

    const added = await call("add_transaction", {
      date: "2025-01-10",
      description: "NTT 通信料",
      amount: -5000,
      category: "通信費",
    });
    expect(added.isError).toBeUndefined();
    const transaction = json(added)["transaction"] as { id: number };
    expect(json(added)["warning"]).toContain("学習履歴");

    const updated = await call("update_transaction", { id: transaction.id, category: "雑費" });
    expect(updated.isError).toBeUndefined();
    expect(json(updated)["warning"]).toContain("学習履歴");

    const rows = await runWithTenant(userId, () => listTransactionRows(db));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe("雑費");
  });
});

describe("register_fixed_asset の入力検証", () => {
  const base = {
    name: "PC",
    acquisition_date: "2024-01-10",
    cost: 300_000,
    useful_life_years: 4,
  };

  test("REST と同じく範囲外・小数の事業専用割合や不正な日付は登録しない", async () => {
    for (const extra of [
      { business_ratio_percent: 150 },
      { business_ratio_percent: 50.5 },
      { service_start_date: "abc" },
      { income_type: "other" },
    ]) {
      const result = await call("register_fixed_asset", { ...base, ...extra });
      expect(result.isError).toBe(true);
      expect(text(result)).toContain("固定資産の入力が不正です");
    }
    const listed = json(await call("list_fixed_assets", {}));
    expect(listed["assets"]).toEqual([]);
  });

  test("正しい入力は登録でき、減価償却も計算できる", async () => {
    const result = await call("register_fixed_asset", { ...base, business_ratio_percent: 60 });
    expect(result.isError).toBeUndefined();
    const depreciation = await call("get_depreciation", { year: 2025 });
    expect(depreciation.isError).toBeUndefined();
  });
});

describe("XTX・PDF 出力の taxpayer", () => {
  const taxpayer = {
    name: "テスト太郎",
    name_kana: "テストタロウ",
    zip_code: "1000001",
    address: "東京都千代田区霞が関一丁目1番1号",
    birth_date: "1980-04-01",
    phone: "09000000000",
    tax_office_name: "麹町",
    tax_office_code: "01101",
    user_id: "1234567890123456",
  };

  test("任意の項目を省いても出力できる", async () => {
    const income = await call("export_xtx", { year: 2025, taxpayer });
    expect(income.isError).toBeUndefined();
    const consumption = await call("export_consumption_xtx", {
      taxpayer,
      period_from: "2025-01-01",
      period_to: "2025-12-31",
      base_period_sales_thousands: 5000,
      sales_incl_10: 1_100_000,
      purchases_incl_10: 550_000,
    });
    expect(consumption.isError).toBeUndefined();
  });

  test("必須の項目が欠けていれば、不足している項目を案内する", async () => {
    const result = await call("export_xtx", {
      year: 2025,
      taxpayer: { name: "テスト太郎", name_kana: "テストタロウ" },
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("納税者情報に不足");
    expect(text(result)).not.toContain("TypeError");
  });

  test("文字列でない項目はエラーにする", async () => {
    const result = await call("export_xtx", { year: 2025, taxpayer: { ...taxpayer, name: 123 } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("taxpayer");
  });
});

describe("get_trial_balance の申告の種類", () => {
  test("不正な filing_type は既定（青色65万円）として扱い、控除と所得を数値で返す", async () => {
    await call("add_transaction", {
      date: "2025-02-01",
      description: "売上 A社",
      amount: 2_000_000,
      category: "売上高",
      income_type: "business",
    });
    const result = json(await call("get_trial_balance", { year: 2025, filing_type: "blue_65" }));
    const business = result["business"] as { blue_deduction: unknown; income: unknown };
    expect(business.blue_deduction).toBe(650_000);
    expect(business.income).toBe(1_350_000);
  });
});

describe("中核ツールの引数検証", () => {
  test("add_transaction は amount・description が無ければ登録しない", async () => {
    const noAmount = await call("add_transaction", { date: "2025-02-01", description: "摘要" });
    expect(noAmount.isError).toBe(true);
    expect(text(noAmount)).toContain("amount");
    const noDescription = await call("add_transaction", { date: "2025-02-01", amount: -1000 });
    expect(noDescription.isError).toBe(true);
    expect(text(noDescription)).toContain("description");
    const rows = await runWithTenant(userId, () => listTransactionRows(db));
    expect(rows).toEqual([]);
  });

  test("year が無い・不正なら、SQL を投げずに引数のエラーを返す", async () => {
    for (const name of ["aggregate_year", "consumption_tax", "income_tax", "get_depreciation", "set_filing_status"]) {
      const result = await call(name, {});
      expect(result.isError).toBe(true);
      expect(text(result)).toContain("year が不正です");
    }
  });

  test("list_transactions は文字列の year でも絞り込む", async () => {
    await call("add_transaction", { date: "2024-05-01", description: "2024年分", amount: -1000 });
    await call("add_transaction", { date: "2025-05-01", description: "2025年分", amount: -1000 });
    const listed = json(await call("list_transactions", { year: "2024" }));
    expect(listed["count"]).toBe(1);
  });

  test("ID の引数は正の整数だけを受け付ける", async () => {
    for (const [name, args] of [
      ["update_transaction", { id: 1.5, category: "雑費" }],
      ["delete_transaction", { id: "abc" }],
      ["link_receipt", { file_id: "11111111-1111-1111-1111-111111111111", transaction_id: 1.5 }],
    ] as const) {
      const result = await call(name, args);
      expect(result.isError).toBe(true);
      expect(text(result)).toContain("正の整数");
    }
  });

  test("DB のエラーは SQL 文を含めずに返す", async () => {
    const result = await call("update_transaction", { id: 10_000_000_000, category: "雑費" });
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain("Failed query");
    expect(text(result)).toContain("データベース");
  });
});

describe("REST と同じ入力上限", () => {
  test("classify_batch は200件まで", async () => {
    const items = Array.from({ length: 201 }, (_, i) => ({ description: `摘要 ${i}` }));
    const result = await call("classify_batch", { items });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("200件");
  });

  test("update_classify_settings はプロンプトの長さとルールを検証してから保存する", async () => {
    const tooLong = await call("update_classify_settings", { jev_prompt: "あ".repeat(8001) });
    expect(tooLong.isError).toBe(true);
    expect(text(tooLong)).toContain("8000");

    const invalidRules = await call("update_classify_settings", {
      jev_prompt: "新しいプロンプト",
      regex_rules: [{ pattern: "(a+)+", category: "雑費" }],
    });
    expect(invalidRules.isError).toBe(true);
    const settings = json(await call("get_classify_settings", {}));
    expect((settings["jev_prompt"] as { customPrompt: string }).customPrompt).toBe("");
  });

  test("正規表現ルールは500件まで", async () => {
    const rules = Array.from({ length: 501 }, (_, i) => ({ pattern: `店${i}`, category: "雑費" }));
    const result = await call("update_classify_settings", { regex_rules: rules });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("500件");
  });
});

describe("get_freee_trial_balance の所有者別ファイル", () => {
  test("既定ユーザーは無印、他の所有者は -<ID> のファイルを読む", async () => {
    const other = (await createUser(db, "mcp-tools-other@example.com", "password-123")).id;
    expect(userId).toBe(DEFAULT_OWNER_ID);
    const dataDir = process.env.ETAX_DATA_DIR!;
    await writeFile(join(dataDir, "freee-trial-balance.json"), JSON.stringify({ owner: "legacy" }));
    await writeFile(join(dataDir, `freee-trial-balance-${other}.json`), JSON.stringify({ owner: "other" }));

    expect(json(await call("get_freee_trial_balance", {}))).toEqual({ owner: "legacy" });
    const otherResult = await runWithTenant(other, () => dispatchMcpTool("get_freee_trial_balance", {}));
    expect(json(otherResult)).toEqual({ owner: "other" });
  });
});
