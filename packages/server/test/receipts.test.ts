/**
 * receipts.test.ts — 証憑と取引の紐付けリポジトリの検証。
 * テスト用 PostgreSQL で検証する。
 */
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { Db } from "../src/lib/db";
import {
  linkReceiptRow,
  listReceiptRows,
  listReceiptRowsForTransaction,
  receiptToApi,
  unlinkReceiptRow,
  upsertReceiptExtraction,
} from "../src/repositories/receiptRepository";
import { insertTransactionRow } from "../src/repositories/transactionRepository";

/** 紐付け先の取引を1件作り、そのIDを返す（FK があるため実在の取引が要る）。 */
async function createTransactionId(db: Db): Promise<number> {
  const row = await insertTransactionRow(db, {
    date: "2026-11-01",
    fiscalYear: 2026,
    description: "コンビニ 消耗品",
    amount: -5500,
    account: "現金",
    category: "消耗品費",
    incomeType: "business",
    taxCategory: "",
    businessRatioPercent: 100,
    businessRatioBasis: "",
  });
  return row!.id;
}

const EXTRACTED = {
  date: "2026-11-01",
  amount: 5500,
  payee: "コンビニ",
  description: "消耗品",
  classification: { account: "消耗品費", confidence: null, source: "rules" as const, candidates: [] },
};

describe("証憑リポジトリ", () => {
  test("解析結果の upsert は紐付けを保持し、内容を更新する", async () => {
    const db = await createTestDb();
    const transactionId = await createTransactionId(db);
    const fileId = "123e4567-e89b-12d3-a456-426614174000";
    await upsertReceiptExtraction(db, fileId, "image/jpeg", EXTRACTED);
    await linkReceiptRow(db, fileId, transactionId);
    const updated = await upsertReceiptExtraction(db, fileId, "image/jpeg", {
      ...EXTRACTED,
      amount: 6600,
    });
    expect(updated?.transactionId).toBe(transactionId);
    expect(receiptToApi(updated!).extracted?.amount).toBe(6600);
    expect((await listReceiptRows(db)).length).toBe(1);
  });

  test("取引ごとの証憑一覧と紐付け解除", async () => {
    const db = await createTestDb();
    const transactionId = await createTransactionId(db);
    const fileId = "123e4567-e89b-12d3-a456-426614174001";
    // レコードが無くても紐付けで作られる
    const linked = await linkReceiptRow(db, fileId, transactionId);
    expect(linked?.transactionId).toBe(transactionId);
    expect((await listReceiptRowsForTransaction(db, transactionId)).length).toBe(1);
    const unlinked = await unlinkReceiptRow(db, fileId);
    expect(unlinked?.transactionId).toBeNull();
    expect((await listReceiptRowsForTransaction(db, transactionId)).length).toBe(0);
    expect(await unlinkReceiptRow(db, "unknown-file")).toBeNull();
  });
});
