import { describe, expect, test } from "bun:test";
import { classifyAccount } from "../src/services/classification/classifyAccount";
import { validateRegexRules } from "../src/services/classification/validateRegexRules";

describe("validateRegexRules", () => {
  test("正しいルールは通る", () => {
    const result = validateRegexRules([{ pattern: "よどばし", category: "消耗品費" }]);
    expect(result.ok).toBe(true);
  });

  test("空配列は自動生成に戻すとして有効", () => {
    expect(validateRegexRules([]).ok).toBe(true);
  });

  test("正規表現として不正なパターンは弾く", () => {
    const result = validateRegexRules([{ pattern: "([", category: "消耗品費" }]);
    expect(result.ok).toBe(false);
  });

  test("存在しない科目は弾く", () => {
    const result = validateRegexRules([{ pattern: "よどばし", category: "存在しない科目" }]);
    expect(result.ok).toBe(false);
  });
});

describe("classifyAccount の regexRulesOverride", () => {
  test("カスタムルールが自動生成より優先される", async () => {
    const result = await classifyAccount("ヨドバシカメラ キーボード購入", {
      history: [],
      systemOne: null,
      regexRulesOverride: [{ pattern: "ヨドバシ", category: "消耗品費" }],
    });
    expect(result.account).toBe("消耗品費");
    expect(result.source).toBe("generated");
  });

  test("空配列の上書きでは正規表現ルールを使わない", async () => {
    const result = await classifyAccount("ヨドバシカメラ キーボード購入", {
      history: [
        {
          description: "ヨドバシカメラ キーボード購入",
          normalizedKey: "よどばしかめら きーぼーど購入",
          account: "消耗品費",
          count: 3,
        },
        {
          description: "ヨドバシカメラ マウス購入",
          normalizedKey: "よどばしかめら まうす購入",
          account: "消耗品費",
          count: 3,
        },
      ],
      systemOne: null,
      regexRulesOverride: [],
    });
    // 自動生成なら当たるはずの摘要でも、上書きが空なら正規表現では判定しない。
    expect(result.source).not.toBe("generated");
  });
});
