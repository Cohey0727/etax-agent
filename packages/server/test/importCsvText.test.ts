/**
 * importCsvText.test.ts — CSV 取込と年度の一括置き換えの共通の本体の検証。
 *
 * 取込画面（REST）と MCP の import_csv が同じ結果を返し、再取込で重複しないこと、
 * 年度の置き換えが MCP でも REST と同じ規則で割り当て年度を決めることを担保する。
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { Db } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenantContext";
import { createUser } from "../src/repositories/userRepository";
import { CsvImportError, importCsvText } from "../src/services/csvImport/importCsvText";
import { dispatchMcpTool } from "../src/services/mcp/mcpTools";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;

const csv = ["日付,摘要,金額", "2025/03/01,NTT 通信料,-5000", "2025/03/02,A社 売上,50000"].join("\n");
const input = { text: csv, encoding: "utf-8", filename: "bank.csv", sourceName: "" };

let db: Db;
let userId: number;
const asUser = <T>(fn: () => Promise<T>): Promise<T> => runWithTenant(userId, fn);

beforeEach(async () => {
  db = await createTestDb();
  userId = (await createUser(db, "import-csv@example.com", "password-123")).id;
});

describe("importCsvText", () => {
  test("取り込み、同じ CSV の再取込は重複として除く", async () => {
    const first = await asUser(() => importCsvText(db, input));
    expect(first.persisted).toBe(true);
    expect(first.count).toBe(2);
    const second = await asUser(() => importCsvText(db, input));
    expect(second.count).toBe(0);
    expect(second.duplicatesSkipped).toBe(2);
  });

  test("DB が無ければ保存せずにプレビューとして返す", async () => {
    const preview = await importCsvText(null, input);
    expect(preview.persisted).toBe(false);
    expect(preview.importId).toBeNull();
    expect(preview.count).toBe(2);
  });

  test("空の CSV は取込の入力エラー", async () => {
    await expect(importCsvText(null, { ...input, text: "" })).rejects.toBeInstanceOf(CsvImportError);
  });

  test("MCP の import_csv も同じ形の結果を返す", async () => {
    const result = await asUser(() =>
      dispatchMcpTool("import_csv", { content_base64: Buffer.from(csv).toString("base64"), filename: "bank.csv" }),
    );
    const body = JSON.parse(result.content[0]?.text ?? "") as Record<string, unknown>;
    expect(body["count"]).toBe(2);
    expect(body["persisted"]).toBe(true);
    expect(body["persistWarning"]).toBeNull();
    expect(body["encoding"]).toBe("utf-8");
  });
});

describe("年度の一括置き換え（MCP）", () => {
  test("範囲外の割り当て年度は置き換え対象の年にする（REST と同じ規則）", async () => {
    const result = await asUser(() =>
      dispatchMcpTool("replace_year_transactions", {
        year: 2025,
        transactions: [{ date: "2025-04-01", description: "x", amount: -1000, fiscal_year: 99999 }],
      }),
    );
    const body = JSON.parse(result.content[0]?.text ?? "") as { transactions: { fiscal_year: number }[] };
    expect(body.transactions[0]?.fiscal_year).toBe(2025);
  });
});
