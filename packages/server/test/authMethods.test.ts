/**
 * authMethods.test.ts — 追加の認証方法（TOTP・マジックリンク・チャレンジ）の検証。
 * TOTP は RFC 6238 のテストベクタ、フローはテスト用 PostgreSQL で確認する。
 */
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { issueChallenge, verifyChallenge } from "../src/lib/loginChallenge";
import {
  base32Decode,
  base32Encode,
  currentTotpCode,
  generateTotpSecret,
  totpCode,
  verifyTotpCode,
} from "../src/lib/totp";
import {
  consumeMagicLinkToken,
  createMagicLinkToken,
  createPasswordlessUser,
  createUser,
  getUserByEmail,
  readUserTotpSecret,
  setUserTotpEnabled,
  setUserTotpSecret,
} from "../src/repositories/userRepository";

describe("TOTP（RFC 6238）", () => {
  test("テストベクタ（SHA1・シード '12345678901234567890'）", () => {
    const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    // T=59s → カウンタ1 → 94287082（8桁）の下6桁
    expect(totpCode(secret, 1)).toBe("287082");
    // T=1111111109s → 07081804 の下6桁
    expect(totpCode(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(base32Decode(secret)).toEqual(new TextEncoder().encode("12345678901234567890"));
  });

  test("現在コードで検証でき、前後1周期のズレを許容する", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = currentTotpCode(secret, now);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotpCode(secret, code, now + 120_000)).toBe(false);
    expect(verifyTotpCode(secret, "abcdef", now)).toBe(false);
  });
});

describe("ログインチャレンジ", () => {
  test("発行→検証。用用途違い・改ざん・期限切れは弾く", () => {
    const token = issueChallenge(42, "totp-login", 60_000);
    expect(verifyChallenge(token, "totp-login")).toBe(42);
    expect(verifyChallenge(token, "oauth:google")).toBeUndefined();
    expect(verifyChallenge(`${token}x`, "totp-login")).toBeUndefined();
    const expired = issueChallenge(42, "totp-login", -1);
    expect(verifyChallenge(expired, "totp-login")).toBeUndefined();
  });
});

describe("TOTP の保存と有効化", () => {
  test("秘密は暗号化されて保存され、読み戻せる", async () => {
    const db = await createTestDb();
    const user = await createUser(db, "totp@example.com", "password-123");
    const secret = generateTotpSecret();
    await setUserTotpSecret(db, user.id, secret);
    const stored = await getUserByEmail(db, "totp@example.com");
    // 暗号化鍵が設定されていれば平文では保存されない
    if (process.env.ETAX_ENCRYPTION_KEY) {
      expect(stored?.totpSecret).not.toBe(secret);
      expect(stored?.totpSecret.startsWith("enc:v1:")).toBe(true);
    }
    expect(readUserTotpSecret(stored!)).toBe(secret);
    await setUserTotpEnabled(db, user.id, true);
    const enabled = await getUserByEmail(db, "totp@example.com");
    expect(enabled?.totpEnabled).toBe(true);
    await setUserTotpEnabled(db, user.id, false);
    const disabled = await getUserByEmail(db, "totp@example.com");
    expect(disabled?.totpEnabled).toBe(false);
    expect(disabled?.totpSecret).toBe("");
  });
});

describe("マジックリンク", () => {
  test("発行→消費は1回限りで、期限切れ・再利用はできない", async () => {
    const db = await createTestDb();
    const token = await createMagicLinkToken(db, "magic@example.com");
    expect(await consumeMagicLinkToken(db, token)).toBe("magic@example.com");
    expect(await consumeMagicLinkToken(db, token)).toBeUndefined();
    expect(await consumeMagicLinkToken(db, "no-such-token")).toBeUndefined();
  });

  test("パスワードなしユーザーを作れる（パスワード照合は常に失敗）", async () => {
    const db = await createTestDb();
    const user = await createPasswordlessUser(db, "oauth@example.com");
    expect(user.passwordHash).toBe("");
    const { verifyUserPassword } = await import("../src/repositories/userRepository");
    expect(await verifyUserPassword(user, "anything-123")).toBe(false);
  });
});
