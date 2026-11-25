/**
 * challengeUse.test.ts — ログインチャレンジの再利用防止（Issue #6）。
 * TTL 内でも、消費済みチャレンジや試行上限を超えたチャレンジは使えない。
 */
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
