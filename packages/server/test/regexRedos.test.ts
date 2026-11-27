/**
 * regexRedos.test.ts — ユーザー正規表現ルールの ReDoS 対策検証。
 * 破滅的バックトラックを起こす形は保存時に弾き、通常のルールと
 * 学習履歴から自動生成したルールは保存・照合できる。
 */
import { describe, expect, test } from "bun:test";
import {
  hasNestedQuantifier,
  validateRegexRules,
} from "../src/services/classification/validateRegexRules";
import {
  generateRules,
  matchGeneratedRule,
} from "../src/services/classification/generateRules";
import { normalizeDescriptionKey } from "../src/repositories/classificationHistoryRepository";

describe("hasNestedQuantifier", () => {
  test("入れ子の量指定子を検出する", () => {
    expect(hasNestedQuantifier("(a+)+")).toBe(true);
    expect(hasNestedQuantifier("(.*)*")).toBe(true);
    expect(hasNestedQuantifier("(\\d{2,})+")).toBe(true);
    expect(hasNestedQuantifier("x(a|b*c)+y")).toBe(true);
  });

  test("グループをさらに包んだ入れ子も検出する", () => {
    expect(hasNestedQuantifier("((a+))+")).toBe(true);
    expect(hasNestedQuantifier("(?:(a+))+")).toBe(true);
    expect(hasNestedQuantifier("((a+)b?)+")).toBe(true);
  });

  test("量指定子つきグループ内の選択を検出する", () => {
    expect(hasNestedQuantifier("(a|aa)+")).toBe(true);
    expect(hasNestedQuantifier("((a|aa))+")).toBe(true);
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
  const accepts = (pattern: string) =>
    validateRegexRules([{ pattern, category: "雑費" }]).ok;

  test("入れ子パターンは保存できない", () => {
    expect(accepts("(a+)+$")).toBe(false);
    expect(accepts("((a+))+$")).toBe(false);
    expect(accepts("(a|aa)+$")).toBe(false);
  });

  test("量指定子の重なりが多いパターンは保存できない", () => {
    expect(accepts(".*.*.*z")).toBe(false);
    expect(accepts("\\w+\\d+\\w+\\d+!")).toBe(false);
    expect(accepts("\\d+\\d+\\d+")).toBe(false);
    expect(accepts(".{0,100}.{0,100}.{0,100}z")).toBe(false);
    expect(accepts("\\d{4}-\\d{2}-\\d{2}")).toBe(true);
  });

  test("長すぎるパターンは保存できない", () => {
    expect(accepts("a".repeat(201))).toBe(false);
  });

  test("通常のルールは保存でき、照合も同じ", () => {
    // 照合は正規化（小文字化）した摘要に対して行う仕様
    const result = validateRegexRules([{ pattern: "amazon|楽天", category: "売上高" }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(matchGeneratedRule("AMAZON.CO.JP", result.rules)?.category).toBe("売上高");
      expect(matchGeneratedRule("コンビニ", result.rules)).toBeNull();
    }
    expect(accepts("amazon.*書籍")).toBe(true);
  });

  test("学習履歴から自動生成したルールはそのまま保存できる", () => {
    const history = [
      "V202734 ドン・キホーテ福山店",
      "振込 2025/03/01 12:30 カード 1234 支払",
      "AWS 利用料 2025年3月分",
    ].map((description) => ({
      key: normalizeDescriptionKey(description),
      description,
      account: "雑費",
      count: 2,
      updatedAt: "2026-11-15T00:00:00.000Z",
    }));
    const generated = generateRules(history).regexRules;
    expect(generated.length).toBeGreaterThan(0);
    const result = validateRegexRules(
      generated.map((rule) => ({ pattern: rule.pattern, category: rule.category })),
    );
    expect(result.ok).toBe(true);
  });
});

describe("matchGeneratedRule の照合範囲", () => {
  test("照合は摘要の先頭200文字までで行う", () => {
    const rules = [{ pattern: "目印", category: "雑費" }];
    expect(matchGeneratedRule(`${"あ".repeat(150)}目印`, rules)?.category).toBe("雑費");
    expect(matchGeneratedRule(`${"あ".repeat(250)}目印`, rules)).toBeNull();
  });
});
