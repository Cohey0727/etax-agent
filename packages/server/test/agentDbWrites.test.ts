/**
 * agentDbWrites.test.ts — 対話エージェントによる帳簿DBへの書き込みの検証。
 *
 * 一括変更の安全策（絞り込み条件・変更内容が必須）が空文字で
 * すり抜けられないこと、書き込み後の読み直しが家事按分を保つことを担保する。
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregateIncome } from "@etax/shared";
import { createTestDb } from "./testDb";
import { Db } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenantContext";
import { createUser } from "../src/repositories/userRepository";
import { loadClassificationHistory } from "../src/repositories/classificationHistoryRepository";
import {
  insertTransactionRow,
  listTransactionRows,
} from "../src/repositories/transactionRepository";
import {
  loadAllTransactionsForAgent,
  updateTransactionsBulk,
} from "../src/services/agent/agentDbWrites";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;

let db: Db;
let userId: number;

const asUser = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant(userId, fn);

async function addRow(values: Partial<Parameters<typeof insertTransactionRow>[1]>) {
  return asUser(() =>
    insertTransactionRow(db, {
      date: "2025-03-01",
      fiscalYear: 2025,
      description: "摘要",
      amount: -1000,
      account: "",
      category: "未分類",
      incomeType: "business",
      taxCategory: "",
      businessRatioPercent: 100,
      businessRatioBasis: "",
      ...values,
    }),
  );
}

beforeEach(async () => {
  process.env.ETAX_DATA_DIR = await mkdtemp(join(tmpdir(), "etax-agent-db-writes-"));
  db = await createTestDb();
  userId = (await createUser(db, "agent-writes@example.com", "password-123")).id;
});

describe("updateTransactionsBulk", () => {
  test("空文字だけの keyword は絞り込み条件にならない", async () => {
    await addRow({ description: "NTT 通信", category: "通信費" });
    await addRow({ description: "文具", category: "消耗品費" });
    for (const keyword of ["", "   "]) {
      await expect(
        asUser(() => updateTransactionsBulk({ keyword, setCategory: "雑費" })),
      ).rejects.toThrow("絞り込み条件");
    }
    const rows = await asUser(() => listTransactionRows(db));
    expect(rows.map((row) => row.category).sort()).toEqual(["消耗品費", "通信費"]);
  });

  test("空文字の set_* は変更内容として扱わない", async () => {
    await addRow({
      description: "Amazon 書籍",
      category: "新聞図書費",
      incomeType: "other",
      taxCategory: "課対仕入10%",
    });
    const result = await asUser(() =>
      updateTransactionsBulk({
        keyword: "Amazon",
        setIncomeType: "business",
        setCategory: "",
        setTaxCategory: "",
      }),
    );
    expect(result.changes).toEqual({ income_type: "business" });
    const [row] = await asUser(() => listTransactionRows(db));
    expect(row?.category).toBe("新聞図書費");
    expect(row?.taxCategory).toBe("課対仕入10%");
    expect(row?.incomeType).toBe("business");
    expect(await asUser(() => loadClassificationHistory())).toEqual([]);
  });

  test("変更内容が空文字だけなら実行しない", async () => {
    await addRow({ description: "Amazon 書籍", category: "新聞図書費" });
    await expect(
      asUser(() => updateTransactionsBulk({ keyword: "Amazon", setCategory: " " })),
    ).rejects.toThrow("変更内容");
  });
});

describe("loadAllTransactionsForAgent", () => {
  test("読み直した取引は事業専用割合を保ち、集計に按分が反映される", async () => {
    await addRow({
      description: "家賃",
      category: "地代家賃",
      amount: -100_000,
      businessRatioPercent: 30,
      businessRatioBasis: "面積割合",
    });
    const transactions = await asUser(() => loadAllTransactionsForAgent());
    expect(transactions[0]?.business_ratio_percent).toBe(30);
    expect(transactions[0]?.business_ratio_basis).toBe("面積割合");
    expect(aggregateIncome(transactions).businessExpenses).toBe(30_000);
  });
});
