/**
 * validateRegexRules.ts — 正規表現ルール入力の検証（services/classification）。
 *
 * 設定画面の保存とエージェントのツールから共通で使う。パターンが
 * 正規表現として成立することと、科目が勘定科目マスタにあることを確かめ、
 * 正規化したルール配列か、エラーメッセージのどちらかを返す。
 */
import { ACCOUNT_NAMES } from "@etax/shared";
import { RegexRule } from "./generateRules";

export type ValidateRegexRulesResult =
  | { ok: true; rules: RegexRule[] }
  | { ok: false; message: string };

/** ルール入力を検証する。空配列は「自動生成に戻す」として有効。 */
export function validateRegexRules(input: readonly RegexRule[]): ValidateRegexRulesResult {
  const rules: RegexRule[] = [];
  for (const [index, rule] of input.entries()) {
    const pattern = typeof rule?.pattern === "string" ? rule.pattern.trim() : "";
    const category = typeof rule?.category === "string" ? rule.category : "";
    if (pattern === "") {
      return { ok: false, message: `${index + 1}行目: 正規表現が空です` };
    }
    try {
      new RegExp(pattern);
    } catch {
      return { ok: false, message: `${index + 1}行目: 正規表現として不正です（${pattern}）` };
    }
    if (!(ACCOUNT_NAMES as readonly string[]).includes(category)) {
      return { ok: false, message: `${index + 1}行目: 科目「${category}」は勘定科目にありません` };
    }
    rules.push({ pattern, category });
  }
  return { ok: true, rules };
}
