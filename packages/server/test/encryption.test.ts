/**
 * encryption.test.ts — 機微項目の保存時暗号化の検証。
 * 鍵は環境変数 ETAX_ENCRYPTION_KEY（Base64 32バイト）。
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptField, encryptField, encryptionEnabled } from "../src/lib/encryption";

const KEY = randomBytes(32).toString("base64");
const ORIGINAL_ENV = process.env.ETAX_ENCRYPTION_KEY;

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env.ETAX_ENCRYPTION_KEY;
  else process.env.ETAX_ENCRYPTION_KEY = ORIGINAL_ENV;
});

describe("encryptField / decryptField", () => {
  test("鍵があると暗号化され、復号で戻る。平文は混ざらない", () => {
    process.env.ETAX_ENCRYPTION_KEY = KEY;
    expect(encryptionEnabled()).toBe(true);
    const encrypted = encryptField("123456789012");
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toContain("123456789012");
    expect(decryptField(encrypted)).toBe("123456789012");
    // 同じ平文でも IV が変わるので暗号文は毎回違う
    expect(encryptField("123456789012")).not.toBe(encrypted);
  });

  test("鍵が無いと平文のまま（従来のローカル運用）", () => {
    delete process.env.ETAX_ENCRYPTION_KEY;
    expect(encryptionEnabled()).toBe(false);
    expect(encryptField("123456789012")).toBe("123456789012");
    expect(decryptField("123456789012")).toBe("123456789012");
  });

  test("既存の平文データは鍵があってもそのまま読める（移行互換）", () => {
    process.env.ETAX_ENCRYPTION_KEY = KEY;
    expect(decryptField("1234567890123456")).toBe("1234567890123456");
    expect(decryptField("")).toBe("");
    expect(encryptField("")).toBe("");
  });

  test("鍵が違うと復号に失敗する（改ざん検知）", () => {
    process.env.ETAX_ENCRYPTION_KEY = KEY;
    const encrypted = encryptField("secret");
    process.env.ETAX_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptField(encrypted)).toThrow();
  });
});
