/**
 * regexRedos.test.ts — ユーザー正規表現ルールの ReDoS 対策検証（Issue #7）。
 * 入れ子の量指定子は保存時に弾き、通常のルールは従来どおり使える。
 */
import { describe, expect, test } from "bun:test";
import {
  hasNestedQuantifier,
  validateRegexRules,
} from "../src/services/classification/validateRegexRules";
import { matchGeneratedRule } from "../src/services/classification/generateRules";

describe("hasNestedQuantifier", () => {
  test("入れ子の量指定子を検出する", () => {
    expect(hasNestedQuantifier("(a+)+")).toBe(true);
    expect(hasNestedQuantifier("(.*)*")).toBe(true);
    expect(hasNestedQuantifier("(\\d{2,})+")).toBe(true);
    expect(hasNestedQuantifier("x(a|b*c)+y")).toBe(true);
  });

  test("通常のパターンは検出しない", () => {
    expect(hasNestedQuantifier("amazon|楽天")).toBe(false);
    expect(hasNestedQuantifier("(株|有限会社)")).toBe(false);
    expect(hasNestedQuantifier("\\d{4}-\\d{2}")).toBe(false);
    expect(hasNestedQuantifier("(a+)")).toBe(false);
    expect(hasNestedQuantifier("[(+*)]+")).toBe(false);
    expect(hasNestedQuantifier("\\(a\\+\\)\\+")).toBe(false);
  });
});

describe("validateRegexRules の ReDoS 対策", () => {
  test("入れ子パターンは保存できない", () => {
    const result = validateRegexRules([{ pattern: "(a+)+$", category: "売上高" }]);
    expect(result.ok).toBe(false);
  });

  test("長すぎるパターンは保存できない", () => {
    const result = validateRegexRules([{ pattern: "a".repeat(201), category: "売上高" }]);
    expect(result.ok).toBe(false);
  });

  test("通常のルールは保存でき、照合も従来どおり", () => {
    // 照合は正規化（小文字化）した摘要に対して行う仕様
    const result = validateRegexRules([{ pattern: "amazon|楽天", category: "売上高" }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(matchGeneratedRule("AMAZON.CO.JP", result.rules)?.category).toBe("売上高");
      expect(matchGeneratedRule("コンビニ", result.rules)).toBeNull();
    }
  });
});
