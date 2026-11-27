/**
 * authVerification.test.ts — メール確認基盤と Pre-Account Takeover 対策の検証。
 * 未確認のパスワード登録アカウントへ OAuth/マジックリンクを統合しても、
 * 先行登録者のパスワードで乗っ取れないことを確認する。
 */
import { describe, expect, spyOn, test } from "bun:test";
import { createTestDb } from "./testDb";
import {
  consumeEmailVerificationToken,
  consumeMagicLinkToken,
  createEmailVerificationToken,
  createMagicLinkToken,
  createPasswordlessUser,
  createUser,
  findOrCreateOAuthUser,
  getUserByEmail,
  verifyUserPassword,
} from "../src/repositories/userRepository";

describe("メール確認トークン", () => {
  test("発行→消費は1回限りでユーザーIDを返す", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "verify@example.com", "password-123", false);
    expect(user.emailVerified).toBe(false);
    const token = await createEmailVerificationToken(db, user.id);
    expect(await consumeEmailVerificationToken(db, token)).toBe(user.id);
    expect(await consumeEmailVerificationToken(db, token)).toBeUndefined();
    expect(await consumeEmailVerificationToken(db, "no-such-token")).toBeUndefined();
  });
});

describe("Pre-Account Takeover 対策", () => {
  test("未確認のパスワード登録に OAuth を統合するとパスワードは引き継がれない", async () => {
    const db = await createTestDb();
    // 攻撃者が被害者のメールで先行登録（未確認）した状態を作る
    const preregistered = await createUser(db, "victim@example.com", "attacker-pass-1", false);
    expect(await verifyUserPassword(preregistered, "attacker-pass-1")).toBe(true);

    // 被害者本人が Google でログイン → 統合されるが資格情報は引き継がない
    const user = await findOrCreateOAuthUser(db, "google", "google-uid-1", "victim@example.com");
    expect(user.id).toBe(preregistered.id);
    expect(user.emailVerified).toBe(true);
    const after = await getUserByEmail(db, "victim@example.com");
    expect(after?.passwordHash).toBe("");
    expect(await verifyUserPassword(after!, "attacker-pass-1")).toBe(false);
  });

  test("確認済みアカウントへの OAuth 統合ではパスワードを保持する", async () => {
    const db = await createTestDb();
    const registered = await createUser(db, "owner@example.com", "owner-pass-123", true);
    const user = await findOrCreateOAuthUser(db, "github", "github-uid-1", "owner@example.com");
    expect(user.id).toBe(registered.id);
    const after = await getUserByEmail(db, "owner@example.com");
    expect(await verifyUserPassword(after!, "owner-pass-123")).toBe(true);
  });
});

describe("マジックリンクの二重消費", () => {
  test("並行して消費しても成功は1回だけ", async () => {
    const db = await createTestDb();
    const token = await createMagicLinkToken(db, "race@example.com");
    const results = await Promise.all([
      consumeMagicLinkToken(db, token),
      consumeMagicLinkToken(db, token),
    ]);
    expect(results.filter((r) => r === "race@example.com")).toHaveLength(1);
  });
});

describe("パスワード照合の応答時間", () => {
  test("ユーザーが無い・パスワード未設定でも、照合と同じハッシュ検証を行う", async () => {
    const db = await createTestDb();
    const passwordless = await createPasswordlessUser(db, "passwordless@example.com");
    const verify = spyOn(Bun.password, "verify");
    try {
      expect(await verifyUserPassword(undefined, "guess-pass")).toBe(false);
      expect(await verifyUserPassword(passwordless, "guess-pass")).toBe(false);
      expect(verify).toHaveBeenCalledTimes(2);
    } finally {
      verify.mockRestore();
    }
  });
});
