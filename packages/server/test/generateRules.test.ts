import { describe, expect, test } from "bun:test";
import {
  ClassificationHistoryRecord,
  normalizeDescriptionKey,
} from "../src/repositories/classificationHistoryRepository";
import {
  generateRules,
  matchGeneratedRule,
  patternFromDescription,
} from "../src/services/classification/generateRules";

const record = (
  description: string,
  account: string,
  count = 1,
): ClassificationHistoryRecord => ({
  key: normalizeDescriptionKey(description),
  description,
  account,
  count,
  updatedAt: "2026-11-15T00:00:00.000Z",
});

describe("patternFromDescription", () => {
  test("数字列は \\d+ に一般化される", () => {
    const pattern = patternFromDescription("V202734 ドン・キホーテ福山店");
    expect(pattern).toContain("\\d+");
    expect(pattern).toContain("ドン・キホーテ福山店");
  });

  test("正規表現の特殊文字はエスケープされる", () => {
    const pattern = patternFromDescription("A+B (テスト)");
    expect(pattern).toContain("a\\+b");
    expect(pattern).toContain("\\(テスト\\)");
  });

  test("数字だけの摘要はパターンにならない", () => {
    expect(patternFromDescription("123456")).toBeNull();
  });
});

describe("generateRules", () => {
  test("同じ摘要×科目の確定回数が合算される", () => {
    const rules = generateRules([
      record("AWS 利用料", "通信費", 2),
      record("AWS 利用料", "通信費", 3),
    ]);
    expect(rules.regexRules).toHaveLength(1);
    expect(rules.regexRules[0]?.count).toBe(5);
    expect(rules.regexRules[0]?.category).toBe("通信費");
  });

  test("科目が割れて拮抗するパターンは採用されない", () => {
    const rules = generateRules([
      record("謎の店", "消耗品費", 2),
      record("謎の店", "雑費", 2),
    ]);
    expect(rules.regexRules).toHaveLength(0);
  });

  test("最多の科目が次点の2倍以上なら採用される", () => {
    const rules = generateRules([
      record("謎の店", "消耗品費", 4),
      record("謎の店", "雑費", 1),
    ]);
    expect(rules.regexRules).toHaveLength(1);
    expect(rules.regexRules[0]?.category).toBe("消耗品費");
  });

  test("「 - 支店名」を落とした頭パターンも生成される", () => {
    const rules = generateRules([
      record("スターバックス コーヒー - 東京駅店", "会議費", 1),
      record("スターバックス コーヒー - 大阪駅店", "会議費", 1),
    ]);
    const head = rules.regexRules.find((r) => !r.pattern.includes("東京") && !r.pattern.includes("大阪"));
    expect(head?.category).toBe("会議費");
    expect(head?.count).toBe(2);
  });

  test("jev用プロンプトに適用ルールと確定例が入る", () => {
    const { jevPrompt } = generateRules([
      record("AWS 利用料", "通信費", 3),
      record("AWS 利用料", "通信費", 3),
    ]);
    expect(jevPrompt).toContain("自動生成した適用ルール");
    expect(jevPrompt).toContain("AWS 利用料");
    expect(jevPrompt).toContain("通信費");
    expect(jevPrompt).toContain("個別の確定例");
  });

  test("履歴が無ければプロンプトは空", () => {
    const { jevPrompt, regexRules } = generateRules([]);
    expect(jevPrompt).toBe("");
    expect(regexRules).toHaveLength(0);
  });
});

describe("matchGeneratedRule", () => {
  test("数字が違うだけの摘要にも当たる", () => {
    const { regexRules } = generateRules([
      record("V202734 ドン・キホーテ福山店", "消耗品費", 1),
    ]);
    const hit = matchGeneratedRule("V999999 ドン・キホーテ福山店", regexRules);
    expect(hit?.category).toBe("消耗品費");
  });

  test("当たらなければ null", () => {
    const { regexRules } = generateRules([record("AWS 利用料", "通信費", 1)]);
    expect(matchGeneratedRule("全然関係ない店", regexRules)).toBeNull();
  });
});
