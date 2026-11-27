/**
 * totp.ts — Authenticator アプリ向け TOTP（RFC 6238）の実装（lib）。
 * HMAC-SHA1・30秒周期・6桁。秘密は Base32 で保持し、検証は前後1周期の
 * ズレを許容する。外部ライブラリは使わない（node:crypto のみ）。
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 エンコード（RFC 4648、パディングなし）。 */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Base32 デコード。整形（空白・小文字・パディング）は吸収する。 */
export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[\s=]/g, "");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("Base32 として不正な文字が含まれています");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 新しい TOTP 秘密（Base32、160bit）を生成する。 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** 指定カウンタの TOTP コード（6桁、ゼロ埋め）。 */
export function totpCode(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(4, counter >>> 0);
  view.setUint32(0, Math.floor(counter / 0x1_0000_0000));
  const digest = createHmac("sha1", key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

/** 現在時刻の TOTP コード。 */
export function currentTotpCode(secretBase32: string, nowMs: number = Date.now()): string {
  return totpCode(secretBase32, Math.floor(nowMs / 30_000));
}

/**
 * TOTP コードを検証し、一致した時間カウンタを返す（前後1周期の時計ズレを許容）。
 * 一致しなければ null。同じコードの再利用を拒むため、呼び出し側は
 * 受け入れたカウンタを記録し、それ以前のカウンタを通さない。
 */
export function matchTotpCounter(
  secretBase32: string,
  code: string,
  nowMs: number = Date.now(),
): number | null {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return null;
  const counter = Math.floor(nowMs / 30_000);
  for (const delta of [-1, 0, 1]) {
    const expected = totpCode(secretBase32, counter + delta);
    if (
      timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(normalized, "utf8"))
    ) {
      return counter + delta;
    }
  }
  return null;
}

/** Authenticator アプリ登録用の otpauth URL。 */
export function totpOtpauthUrl(secretBase32: string, accountEmail: string): string {
  const issuer = "eTaxAgent";
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
