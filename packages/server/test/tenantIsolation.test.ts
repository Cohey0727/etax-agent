/**
 * tenantIsolation.test.ts — 残っていた読み取り経路（imports /
 * filing_status / filing_snapshots）と設定系（正規表現ルール等の
 * ファイル保存）のマルチテナント分離の検証。テスト用 PostgreSQL。
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import { getRegexRulesOverride } from "../src/lib/config";
import {
  createImportWithTransactions,
  listImportRows,
} from "../src/repositories/importRepository";
import {
  listFilingStatusRows,
  upsertFilingStatusRow,
} from "../src/repositories/filingStatusRepository";
import {
  insertFilingSnapshotRow,
  listFilingSnapshotRows,
} from "../src/repositories/filingSnapshotRepository";
import { listTransactionRows } from "../src/repositories/transactionRepository";
import { createUser } from "../src/repositories/userRepository";
import {
  loadRegexRulesOverride,
  saveRegexRulesOverride,
} from "../src/repositories/regexRulesRepository";
import { CsvMapping } from "../src/schemas/importCsv";

const mapping: CsvMapping = {
  dateColumn: "日付",
  descriptionColumn: "摘要",
  amountColumn: "金額",
  debitColumn: null,
  creditColumn: null,
  balanceColumn: null,
  accountColumn: null,
  categoryColumn: null,
  incomeTypeColumn: null,
  taxCategoryColumn: null,
  dateFormat: "YYYY/MM/DD",
  amountSign: "as-is",
};

const figures = {
  business_income: 100,
  real_estate_income: 0,
  misc_income: 0,
  total_income: 100,
  total_deductions: 0,
  taxable_income: 100,
  final_tax: 5,
};

describe("imports / filing_status / filing_snapshots の所有者分離", () => {
  test("取込履歴は所有者で分離され、取引にも所有者が付く", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");

    await runWithTenant(userA.id, async () => {
      await createImportWithTransactions(db, {
        filename: "a.csv",
        sourceName: "銀行A",
        mapping,
        transactions: [
          {
            date: "2026-01-05",
            year: 2026,
            description: "売上",
            amount: 1000,
            account: "売上高",
            category: "income",
            income_type: "business",
            tax_category: "課税売上10%",
          },
        ],
      });
    });

    const importsA = await runWithTenant(userA.id, () => listImportRows(db));
    const importsB = await runWithTenant(userB.id, () => listImportRows(db));
    expect(importsA.map((r) => r.filename)).toEqual(["a.csv"]);
    expect(importsB).toEqual([]);

    const txA = await runWithTenant(userA.id, () => listTransactionRows(db));
    const txB = await runWithTenant(userB.id, () => listTransactionRows(db));
    expect(txA.length).toBe(1);
    expect(txB).toEqual([]);

    // 文脈なし（認証オフ）では従来どおり見える
    expect((await listImportRows(db)).length).toBe(1);
  });

  test("申告ステータスは所有者で分離される", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");

    await runWithTenant(userA.id, async () => {
      await upsertFilingStatusRow(db, 2026, { confirmed: true });
    });

    const forA = await runWithTenant(userA.id, () => listFilingStatusRows(db));
    const forB = await runWithTenant(userB.id, () => listFilingStatusRows(db));
    expect(forA.map((r) => r.year)).toEqual([2026]);
    expect(forB).toEqual([]);
  });

  test("確定スナップショットは所有者で分離される", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");

    await runWithTenant(userA.id, async () => {
      await insertFilingSnapshotRow(db, 2026, figures);
    });

    const forA = await runWithTenant(userA.id, () => listFilingSnapshotRows(db, 2026));
    const forB = await runWithTenant(userB.id, () => listFilingSnapshotRows(db, 2026));
    expect(forA.length).toBe(1);
    expect(forB).toEqual([]);
  });
});

describe("設定系（正規表現ルール）の所有者分離", () => {
  const previousDataDir = process.env.ETAX_DATA_DIR;
  let tempDir = "";

  test("所有者ごとに別ファイル・別上書きとして保持される", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "etax-settings-"));
    process.env.ETAX_DATA_DIR = tempDir;

    await runWithTenant(42, async () => {
      await saveRegexRulesOverride([{ pattern: "ヨドバシ", category: "消耗品費" }]);
    });
    expect(getRegexRulesOverride()).toBeNull();
    const for42 = await runWithTenant(42, () => getRegexRulesOverride());
    expect(for42).toEqual([{ pattern: "ヨドバシ", category: "消耗品費" }]);
    const for43 = await runWithTenant(43, () => getRegexRulesOverride());
    expect(for43).toBeNull();

    // 再起動相当：全所有者分を読み直しても分離が保たれる
    await loadRegexRulesOverride();
    const reloaded42 = await runWithTenant(42, () => getRegexRulesOverride());
    expect(reloaded42).toEqual([{ pattern: "ヨドバシ", category: "消耗品費" }]);
    expect(getRegexRulesOverride()).toBeNull();
  });

  afterAll(async () => {
    if (previousDataDir === undefined) delete process.env.ETAX_DATA_DIR;
    else process.env.ETAX_DATA_DIR = previousDataDir;
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });
});
