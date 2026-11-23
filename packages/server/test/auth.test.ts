/**
 * auth.test.ts — 認証基盤（ユーザー/セッション/APIキー）と
 * マルチテナント分離（所有者フィルタ）の検証。テスト用 PostgreSQL。
 */
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
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

describe("ユーザーとセッション", () => {
  test("登録→パスワード照合→セッション解決→APIキー解決", async () => {
    const db = await createTestDb();
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
    const db = await createTestDb();
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
