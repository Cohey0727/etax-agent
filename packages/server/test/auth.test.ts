/**
 * auth.test.ts — 認証基盤（ユーザー/セッション/APIキー）と
 * マルチテナント分離（所有者フィルタ）の検証。インメモリ SQLite。
 */
import { describe, expect, test } from "bun:test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Db } from "../src/lib/db";
import { runWithTenant } from "../src/lib/tenantContext";
import * as schema from "../src/repositories/schema";
import {
  insertTransactionRow,
  listTransactionRows,
} from "../src/repositories/transactionRepository";
import {
  createApiKey,
  createSession,
  createUser,
  getUserByEmail,
  resolveApiKeyUserId,
  resolveSessionUserId,
  verifyUserPassword,
} from "../src/repositories/userRepository";

function createTestDb(): Db {
  const client = new Database(":memory:");
  client.exec(`
    CREATE TABLE users (
      id integer PRIMARY KEY AUTOINCREMENT,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      created_at integer NOT NULL
    );
    CREATE TABLE sessions (
      id integer PRIMARY KEY AUTOINCREMENT,
      user_id integer NOT NULL REFERENCES users(id),
      token_hash text NOT NULL UNIQUE,
      expires_at integer NOT NULL,
      created_at integer NOT NULL
    );
    CREATE TABLE api_keys (
      id integer PRIMARY KEY AUTOINCREMENT,
      user_id integer NOT NULL REFERENCES users(id),
      name text NOT NULL DEFAULT '',
      key_hash text NOT NULL UNIQUE,
      key_prefix text NOT NULL DEFAULT '',
      last_used_at integer,
      created_at integer NOT NULL
    );
    CREATE TABLE transactions (
      id integer PRIMARY KEY AUTOINCREMENT,
      date text NOT NULL,
      fiscal_year integer NOT NULL DEFAULT 0,
      description text NOT NULL DEFAULT '',
      amount integer NOT NULL,
      account text NOT NULL DEFAULT '',
      category text NOT NULL DEFAULT '未分類',
      income_type text NOT NULL DEFAULT 'other',
      tax_category text NOT NULL DEFAULT '',
      import_id integer,
      created_at integer NOT NULL,
      updated_at integer NOT NULL DEFAULT 0,
      deleted_at integer,
      owner_user_id integer NOT NULL DEFAULT 1
    );
    CREATE TABLE transaction_history (
      id integer PRIMARY KEY AUTOINCREMENT,
      transaction_id integer NOT NULL REFERENCES transactions(id),
      action text NOT NULL,
      before text,
      after text,
      created_at integer NOT NULL
    );
  `);
  return drizzle(client, { schema }) as Db;
}

describe("ユーザーとセッション", () => {
  test("登録→パスワード照合→セッション解決→APIキー解決", async () => {
    const db = createTestDb();
    const user = await createUser(db, "a@example.com", "password-123");
    expect(user.id).toBeGreaterThan(0);
    const found = await getUserByEmail(db, "a@example.com");
    expect(found?.id).toBe(user.id);
    expect(await verifyUserPassword(user, "password-123")).toBe(true);
    expect(await verifyUserPassword(user, "wrong-password")).toBe(false);

    const token = await createSession(db, user.id);
    expect(await resolveSessionUserId(db, token)).toBe(user.id);
    expect(await resolveSessionUserId(db, "deadbeef")).toBeUndefined();

    const { key } = await createApiKey(db, user.id, "mcp");
    expect(key.startsWith("etax_")).toBe(true);
    expect(await resolveApiKeyUserId(db, key)).toBe(user.id);
    expect(await resolveApiKeyUserId(db, "etax_nope")).toBeUndefined();
  });
});

describe("マルチテナント分離", () => {
  test("テナント文脈があると取引は所有者で分離される", async () => {
    const db = createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");
    const values = {
      date: "2026-01-05",
      fiscalYear: 2026,
      description: "売上",
      amount: 1000,
      account: "売上高",
      category: "income",
      incomeType: "business",
      taxCategory: "taxable_10",
    };
    await runWithTenant(userA.id, async () => {
      await insertTransactionRow(db, values);
    });
    await runWithTenant(userB.id, async () => {
      await insertTransactionRow(db, { ...values, amount: 2000 });
    });

    const forA = await runWithTenant(userA.id, () => listTransactionRows(db));
    const forB = await runWithTenant(userB.id, () => listTransactionRows(db));
    expect(forA.map((r) => r.amount)).toEqual([1000]);
    expect(forB.map((r) => r.amount)).toEqual([2000]);

    // 文脈なし（認証オフのローカル運用）では従来どおり全件見える
    const all = await listTransactionRows(db);
    expect(all.length).toBe(2);
  });
});
