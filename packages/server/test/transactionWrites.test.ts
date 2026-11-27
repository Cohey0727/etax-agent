/**
 * transactionWrites.test.ts — 取引の登録・更新（REST・MCP・エージェント共通の本体）の検証。
 *
 * 既定値（収入区分の推定・未分類）、入力の検証、学習履歴の記録の規則と、
 * 記録に失敗しても取引の保存は失敗にしないことを、3経路で同じに担保する。
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import { Db } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenantContext";
import { loadClassificationHistory } from "../src/repositories/classificationHistoryRepository";
import { listTransactionRows } from "../src/repositories/transactionRepository";
import { createUser } from "../src/repositories/userRepository";
import { addTransactionForAgent } from "../src/services/agent/agentDbWrites";
import { McpToolResult } from "../src/services/mcp/mcpToolKit";
import { dispatchMcpTool } from "../src/services/mcp/mcpTools";
import {
  TransactionInputError,
  createTransaction,
  updateTransaction,
} from "../src/services/transactions/transactionWrites";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;

let db: Db;
let userId: number;
let dataDir: string;

const asUser = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant(userId, fn);

function mcpJson(result: McpToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? "") as Record<string, unknown>;
}

/** データフォルダの位置にファイルを置き、学習履歴の書き込みを失敗させる。 */
async function blockLearning(): Promise<void> {
  const blocked = join(dataDir, "not-a-directory");
  await writeFile(blocked, "");
  process.env.ETAX_DATA_DIR = blocked;
}

const sharedDataDir = process.env.ETAX_DATA_DIR;

beforeEach(async () => {
  // 学習履歴はデータフォルダのファイルに残るため、テストごとに空のフォルダを使う。
  dataDir = await mkdtemp(join(tmpdir(), "etax-transaction-writes-"));
  process.env.ETAX_DATA_DIR = dataDir;
  db = await createTestDb();
  userId = (await createUser(db, "transaction-writes@example.com", "password-123")).id;
});

afterEach(() => {
  process.env.ETAX_DATA_DIR = sharedDataDir;
});

describe("createTransaction の既定値と検証", () => {
  test("収入区分を省くと、摘要と勘定科目から推定する", async () => {
    const sales = await asUser(() =>
      createTransaction(db, { date: "2025-02-01", description: "A社 売上", amount: 50_000, category: "売上高" }, { learn: false }),
    );
    expect(sales.transaction.incomeType).toBe("business");
    const rent = await asUser(() =>
      createTransaction(db, { date: "2025-02-01", description: "アパート 家賃", amount: 80_000 }, { learn: false }),
    );
    expect(rent.transaction.incomeType).toBe("real_estate");
    const unknown = await asUser(() =>
      createTransaction(db, { date: "2025-02-01", description: "謎の入金", amount: 1000 }, { learn: false }),
    );
    expect(unknown.transaction.incomeType).toBe("other");
    expect(unknown.transaction.category).toBe("未分類");
  });

  test("日付・金額が不正なら登録しない", async () => {
    for (const input of [
      { date: "2025-02-30", amount: 1000 },
      { date: "2025-02-01", amount: 0 },
      { date: "2025-02-01" },
      { amount: 1000 },
    ]) {
      await expect(asUser(() => createTransaction(db, input, { learn: false }))).rejects.toBeInstanceOf(
        TransactionInputError,
      );
    }
    expect(await asUser(() => listTransactionRows(db))).toEqual([]);
  });

  test("範囲外の割り当て年度は日付の年にする", async () => {
    const result = await asUser(() =>
      createTransaction(db, { date: "2025-02-01", amount: -1000, fiscalYear: 99999 }, { learn: false }),
    );
    expect(result.transaction.fiscalYear).toBe(2025);
  });
});

describe("学習履歴の記録", () => {
  test("登録は未分類以外の科目を、更新は科目が変わったときだけ記録する", async () => {
    const created = await asUser(() =>
      createTransaction(db, { date: "2025-02-01", description: "NTT 通信料", amount: -5000, category: "通信費" }, { learn: true }),
    );
    await asUser(() => updateTransaction(db, created.transaction.id, { category: "通信費", amount: -6000 }, { learn: true }));
    await asUser(() => updateTransaction(db, created.transaction.id, { category: "雑費" }, { learn: true }));
    const history = await asUser(() => loadClassificationHistory());
    expect(history.map((r) => [r.account, r.count])).toEqual([
      ["通信費", 1],
      ["雑費", 1],
    ]);
  });

  test("learn が false なら記録しない", async () => {
    await asUser(() =>
      createTransaction(db, { date: "2025-02-01", description: "NTT", amount: -5000, category: "通信費" }, { learn: false }),
    );
    expect(await asUser(() => loadClassificationHistory())).toEqual([]);
  });

  test("記録に失敗しても取引は保存し、警告を返す", async () => {
    await blockLearning();
    const result = await asUser(() =>
      createTransaction(db, { date: "2025-02-01", description: "NTT", amount: -5000, category: "通信費" }, { learn: true }),
    );
    expect(result.learningWarning).toContain("学習履歴");
    expect(await asUser(() => listTransactionRows(db))).toHaveLength(1);
  });
});

describe("updateTransaction", () => {
  test("空の科目は未分類にし、対象が無ければ null", async () => {
    const created = await asUser(() =>
      createTransaction(db, { date: "2025-02-01", amount: -1000, category: "雑費" }, { learn: false }),
    );
    const updated = await asUser(() => updateTransaction(db, created.transaction.id, { category: "" }, { learn: false }));
    expect(updated?.transaction.category).toBe("未分類");
    expect(await asUser(() => updateTransaction(db, 999_999, { category: "雑費" }, { learn: false }))).toBeNull();
  });

  test("金額 0 や暦に無い日付には更新しない", async () => {
    const created = await asUser(() => createTransaction(db, { date: "2025-02-01", amount: -1000 }, { learn: false }));
    await expect(
      asUser(() => updateTransaction(db, created.transaction.id, { amount: 0 }, { learn: false })),
    ).rejects.toBeInstanceOf(TransactionInputError);
    await expect(
      asUser(() => updateTransaction(db, created.transaction.id, { date: "2025-02-29" }, { learn: false })),
    ).rejects.toBeInstanceOf(TransactionInputError);
  });
});

describe("MCP とエージェントも同じ本体を使う", () => {
  test("MCP の add_transaction は収入区分を推定し、金額 0 を拒否する", async () => {
    const added = await asUser(() =>
      dispatchMcpTool("add_transaction", { date: "2025-02-01", description: "家賃 1月分", amount: 80_000 }),
    );
    expect((mcpJson(added)["transaction"] as { income_type: string }).income_type).toBe("real_estate");
    const zero = await asUser(() =>
      dispatchMcpTool("add_transaction", { date: "2025-02-01", description: "x", amount: 0 }),
    );
    expect(zero.isError).toBe(true);
  });

  test("エージェントの add_transaction は学習の記録に失敗しても保存を成功として返す", async () => {
    await blockLearning();
    const result = await asUser(() =>
      addTransactionForAgent({ date: "2025-02-01", description: "A社 売上", amount: 50_000, category: "売上高" }),
    );
    expect(result.ok).toBe(true);
    expect(result.transaction.income_type).toBe("business");
    expect(result.warning).toContain("学習履歴");
  });
});
