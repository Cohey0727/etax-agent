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
import { runWithTenant } from "../src/lib/tenantContext";
import { createUser } from "../src/repositories/userRepository";
import { listTransactionRows } from "../src/repositories/transactionRepository";
import { dispatchMcpTool, McpToolResult } from "../src/services/mcp/mcpTools";

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
