/**
 * rateLimit.test.ts — レート制限の固定ウィンドウ判定と、期限切れバケットの掃除。
 */
import { describe, expect, test } from "bun:test";
import { pruneExpiredRateLimitBuckets, rateLimitExceeded } from "../src/lib/rateLimit";

describe("rateLimitExceeded", () => {
  test("上限までは通し、上限を超えたら制限する。ウィンドウ経過で回復する", () => {
    const key = "test-login:203.0.113.1";
    const t0 = 1_700_000_000_000;
    expect(rateLimitExceeded(key, 3, 60_000, t0)).toBe(false);
    expect(rateLimitExceeded(key, 3, 60_000, t0 + 1)).toBe(false);
    expect(rateLimitExceeded(key, 3, 60_000, t0 + 2)).toBe(false);
    expect(rateLimitExceeded(key, 3, 60_000, t0 + 3)).toBe(true);
    expect(rateLimitExceeded(key, 3, 60_000, t0 + 60_001)).toBe(false);
  });

  test("キーが違えば独立に数える", () => {
    const t0 = 1_700_000_000_000;
    expect(rateLimitExceeded("test-a:203.0.113.2", 1, 60_000, t0)).toBe(false);
    expect(rateLimitExceeded("test-a:203.0.113.2", 1, 60_000, t0)).toBe(true);
    expect(rateLimitExceeded("test-b:203.0.113.2", 1, 60_000, t0)).toBe(false);
  });
});

describe("pruneExpiredRateLimitBuckets", () => {
  test("ウィンドウを過ぎたバケットだけを消す", () => {
    const t0 = 1_600_000_000_000;
    for (let i = 0; i < 3; i++) rateLimitExceeded(`test-prune:203.0.113.${i}`, 5, 1_000, t0);
    rateLimitExceeded("test-prune:alive", 5, 60_000, t0);
    expect(pruneExpiredRateLimitBuckets(t0 + 500)).toBe(0);
    expect(pruneExpiredRateLimitBuckets(t0 + 1_000)).toBeGreaterThanOrEqual(3);
    // 消えたキーは新しいウィンドウとして数え直す
    expect(rateLimitExceeded("test-prune:203.0.113.0", 1, 1_000, t0 + 1_000)).toBe(false);
    expect(rateLimitExceeded("test-prune:alive", 1, 60_000, t0 + 1_000)).toBe(true);
  });
});
