/**
 * receipts.test.ts — 証憑と取引の紐付けリポジトリの検証。
 * インメモリ SQLite で検証する。
 */
import { describe, expect, test } from "bun:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Db } from "../src/lib/db";
import * as schema from "../src/repositories/schema";
import {
  linkReceiptRow,
  listReceiptRows,
  listReceiptRowsForTransaction,
  receiptToApi,
  unlinkReceiptRow,
  upsertReceiptExtraction,
} from "../src/repositories/receiptRepository";

function createTestDb(): Db {
  const client = new Database(":memory:");
  client.exec(`
    CREATE TABLE receipts (
      id integer PRIMARY KEY AUTOINCREMENT,
      file_id text NOT NULL UNIQUE,
      mime_type text NOT NULL DEFAULT '',
      extracted text,
      transaction_id integer,
      created_at integer NOT NULL,
      updated_at integer NOT NULL,
      owner_user_id integer NOT NULL DEFAULT 1);
  `);
  return drizzle(client, { schema }) as Db;
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
    const db = createTestDb();
    const fileId = "123e4567-e89b-12d3-a456-426614174000";
    await upsertReceiptExtraction(db, fileId, "image/jpeg", EXTRACTED);
    await linkReceiptRow(db, fileId, 42);
    const updated = await upsertReceiptExtraction(db, fileId, "image/jpeg", {
      ...EXTRACTED,
      amount: 6600,
    });
    expect(updated?.transactionId).toBe(42);
    expect(receiptToApi(updated!).extracted?.amount).toBe(6600);
    expect((await listReceiptRows(db)).length).toBe(1);
  });

  test("取引ごとの証憑一覧と紐付け解除", async () => {
    const db = createTestDb();
    const fileId = "123e4567-e89b-12d3-a456-426614174001";
    // レコードが無くても紐付けで作られる
    const linked = await linkReceiptRow(db, fileId, 7);
    expect(linked?.transactionId).toBe(7);
    expect((await listReceiptRowsForTransaction(db, 7)).length).toBe(1);
    const unlinked = await unlinkReceiptRow(db, fileId);
    expect(unlinked?.transactionId).toBeNull();
    expect((await listReceiptRowsForTransaction(db, 7)).length).toBe(0);
    expect(await unlinkReceiptRow(db, "unknown-file")).toBeNull();
  });
});
