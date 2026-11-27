/**
 * transactionHistory.test.ts — 取引の論理削除と変更履歴（電子帳簿保存法の
 * 訂正・削除履歴）のリポジトリテスト。テスト用 PostgreSQL で検証する。
 */
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import {
  deleteTransactionRow,
  insertTransactionRow,
  listTransactionFingerprintRows,
  listTransactionHistoryRows,
  listTransactionRows,
  replaceYearTransactionRows,
  transactionHistoryToApi,
  updateTransactionRow,
} from "../src/repositories/transactionRepository";

const values = {
  date: "2026-01-15",
  fiscalYear: 2026,
  description: "AWS 利用料",
  amount: -5500,
  account: "事業口座",
  category: "通信費",
  incomeType: "business",
  taxCategory: "",
  businessRatioPercent: 100,
  businessRatioBasis: "",
};

describe("取引の変更履歴と論理削除", () => {
  test("登録すると変更履歴（登録）が残る", async () => {
    const db = await createTestDb();
    const row = await insertTransactionRow(db, values);
    expect(row).toBeDefined();
    const history = await listTransactionHistoryRows(db, row!.id);
    expect(history.length).toBe(1);
    const entry = transactionHistoryToApi(history[0]);
    expect(entry.action).toBe("created");
    expect(entry.before).toBeNull();
    expect(entry.after?.amount).toBe(-5500);
    expect(entry.after?.deleted_at).toBeNull();
  });

  test("更新すると変更前後の値が履歴に残る", async () => {
    const db = await createTestDb();
    const row = await insertTransactionRow(db, values);
    const updated = await updateTransactionRow(db, row!.id, { amount: -6600 });
    expect(updated?.amount).toBe(-6600);
    const history = await listTransactionHistoryRows(db, row!.id);
    expect(history.length).toBe(2);
    const entry = transactionHistoryToApi(history[0]);
    expect(entry.action).toBe("updated");
    expect(entry.before?.amount).toBe(-5500);
    expect(entry.after?.amount).toBe(-6600);
  });

  test("削除は論理削除で、一覧から消え履歴に残る", async () => {
    const db = await createTestDb();
    const row = await insertTransactionRow(db, values);
    const deleted = await deleteTransactionRow(db, row!.id);
    expect(deleted?.deletedAt).not.toBeNull();
    expect((await listTransactionRows(db)).length).toBe(0);
    // 2回目の削除は対象なし
    expect(await deleteTransactionRow(db, row!.id)).toBeUndefined();
    const history = await listTransactionHistoryRows(db, row!.id);
    const entry = transactionHistoryToApi(history[0]);
    expect(entry.action).toBe("deleted");
    expect(entry.before?.deleted_at).toBeNull();
    expect(entry.after?.deleted_at).not.toBeNull();
  });

  test("削除済みの取引も指紋には残る（再取込で復活しない）", async () => {
    const db = await createTestDb();
    const row = await insertTransactionRow(db, values);
    await deleteTransactionRow(db, row!.id);
    const fingerprints = await listTransactionFingerprintRows(db);
    expect(fingerprints.length).toBe(1);
    expect(fingerprints[0].amount).toBe(-5500);
  });

  test("年度の置き換えで消える取引は論理削除＋履歴になる", async () => {
    const db = await createTestDb();
    const old = await insertTransactionRow(db, values);
    const inserted = await replaceYearTransactionRows(db, 2026, [
      { ...values, description: "GCP 利用料", amount: -3300 },
    ]);
    expect(inserted.length).toBe(1);
    const rows = await listTransactionRows(db);
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe("GCP 利用料");
    const oldHistory = await listTransactionHistoryRows(db, old!.id);
    expect(oldHistory.map((h) => h.action)).toEqual(["deleted", "created"]);
    const newHistory = await listTransactionHistoryRows(db, inserted[0].id);
    expect(newHistory.map((h) => h.action)).toEqual(["created"]);
  });

  test("割り当て年度が未設定（0）の取引も、日付の年の置き換えで消える", async () => {
    const db = await createTestDb();
    const unassigned = { ...values, fiscalYear: 0 };
    await replaceYearTransactionRows(db, 2026, [unassigned]);
    expect((await listTransactionRows(db, undefined, 2026)).length).toBe(1);
    await replaceYearTransactionRows(db, 2026, [unassigned]);
    expect((await listTransactionRows(db, undefined, 2026)).length).toBe(1);
    // 日付が別の年の未設定行は対象外
    await insertTransactionRow(db, { ...unassigned, date: "2025-12-31" });
    await replaceYearTransactionRows(db, 2026, []);
    expect((await listTransactionRows(db, undefined, 2026)).length).toBe(0);
    expect((await listTransactionRows(db, undefined, 2025)).length).toBe(1);
  });
});
