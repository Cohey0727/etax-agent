/**
 * challengeUse.test.ts — ログインチャレンジの再利用防止。
 * TTL 内でも、消費済みチャレンジや試行上限を超えたチャレンジは使えない。
 */
import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  MAX_CHALLENGE_ATTEMPTS,
  beginChallengeUse,
  burnChallenge,
  issueChallenge,
} from "../src/lib/loginChallenge";

describe("チャレンジの使用回数管理", () => {
  test("成功後に消費すると再利用できない", () => {
    const token = issueChallenge(7, "totp-login", 60_000);
    expect(beginChallengeUse(token, "totp-login")).toBe(7);
    burnChallenge(token, "totp-login");
    expect(beginChallengeUse(token, "totp-login")).toBeUndefined();
  });

  test("試行上限を超えると失効する（TOTP総当たり対策）", () => {
    const token = issueChallenge(8, "totp-login", 60_000);
    for (let i = 0; i < MAX_CHALLENGE_ATTEMPTS; i++) {
      expect(beginChallengeUse(token, "totp-login")).toBe(8);
    }
    expect(beginChallengeUse(token, "totp-login")).toBeUndefined();
  });

  test("用途が違う・改ざんされたチャレンジは使用できない", () => {
    const token = issueChallenge(9, "oauth:google", 60_000);
    expect(beginChallengeUse(token, "totp-login")).toBeUndefined();
    expect(beginChallengeUse(`${token}x`, "oauth:google")).toBeUndefined();
  });
});

describe("使用回数を数えられないチャレンジ", () => {
  test("一意な jti を持たないチャレンジは、署名が正しくても使用できない", () => {
    const previous = process.env.ETAX_AUTH_SECRET;
    process.env.ETAX_AUTH_SECRET = "challenge-test-secret";
    try {
      const payload = Buffer.from(
        JSON.stringify({ uid: 10, purpose: "totp-login", exp: Date.now() + 60_000 }),
        "utf8",
      ).toString("base64url");
      const signature = createHmac("sha256", "challenge-test-secret")
        .update(payload)
        .digest("base64url");
      expect(beginChallengeUse(`${payload}.${signature}`, "totp-login")).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env.ETAX_AUTH_SECRET;
      else process.env.ETAX_AUTH_SECRET = previous;
    }
  });
});
