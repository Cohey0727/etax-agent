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

  test("鍵が無いと平文のまま保存・読み出しする", () => {
    delete process.env.ETAX_ENCRYPTION_KEY;
    expect(encryptionEnabled()).toBe(false);
    expect(encryptField("123456789012")).toBe("123456789012");
    expect(decryptField("123456789012")).toBe("123456789012");
  });

  test("プレフィックスの無い値は鍵があっても平文として読む", () => {
    process.env.ETAX_ENCRYPTION_KEY = KEY;
    expect(decryptField("1234567890123456")).toBe("1234567890123456");
    expect(decryptField("")).toBe("");
    expect(encryptField("")).toBe("");
  });

  test("暗号文の形をした入力も暗号化され、読み出しで元の値に戻る", () => {
    process.env.ETAX_ENCRYPTION_KEY = KEY;
    for (const input of ["enc:v1:1234", "enc:v1:a:b:c"]) {
      const stored = encryptField(input);
      expect(stored).not.toBe(input);
      expect(decryptField(stored)).toBe(input);
    }
  });

  test("鍵が違うと復号に失敗する（改ざん検知）", () => {
    process.env.ETAX_ENCRYPTION_KEY = KEY;
    const encrypted = encryptField("secret");
    process.env.ETAX_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptField(encrypted)).toThrow();
  });
});
