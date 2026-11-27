import "./nativeMocks";
import { describe, expect, test } from "bun:test";

const { decodeBase64, encodeBase64 } = await import("../src/api/files");

function randomBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, () => Math.floor(Math.random() * 256));
}

describe("Base64", () => {
  test.each([0, 1, 2, 3, 4, 5, 1000, 70_000])("%i バイトを標準の Base64 と同じ文字列にし、元に戻せる", (length) => {
    const bytes = randomBytes(length);
    const encoded = encodeBase64(bytes);
    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
    expect(Buffer.from(decodeBase64(encoded)).equals(Buffer.from(bytes))).toBe(true);
  });
});
