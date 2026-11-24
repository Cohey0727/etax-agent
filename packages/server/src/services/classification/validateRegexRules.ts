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

/** パターンの最大長（極端に長いパターンは照合コストが読めないため）。 */
export const MAX_REGEX_PATTERN_LENGTH = 200;

function isQuantifierAt(pattern: string, index: number): boolean {
  const ch = pattern[index];
  if (ch === "+" || ch === "*") return true;
  if (ch === "{") {
    const next = pattern[index + 1];
    return next !== undefined && /[0-9,]/.test(next);
  }
  return false;
}

/**
 * 入れ子の量指定子（例: (a+)+、(.*)*、(\d{2,})+）を検出する。
 * 破滅的バックトラック（ReDoS）の代表的な形で、ユーザー入力の正規表現を
 * 帳簿の摘要に当てる経路では処理を止められてしまうため保存時に弾く。
 * エスケープと文字クラスの中身は読み飛ばす。交代形（(a|a)+）までは
 * 検出しない（残存リスクとして許容し、照合側の入力長制限と併用する）。
 */
export function hasNestedQuantifier(pattern: string): boolean {
  const stack: { hasQuantifier: boolean }[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      stack.push({ hasQuantifier: false });
      continue;
    }
    if (ch === ")") {
      const group = stack.pop();
      if (group?.hasQuantifier && isQuantifierAt(pattern, i + 1)) return true;
      continue;
    }
    if (isQuantifierAt(pattern, i)) {
      const top = stack[stack.length - 1];
      if (top) top.hasQuantifier = true;
    }
  }
  return false;
}

/** ルール入力を検証する。空配列は「自動生成に戻す」として有効。 */
export function validateRegexRules(input: readonly RegexRule[]): ValidateRegexRulesResult {
  const rules: RegexRule[] = [];
  for (const [index, rule] of input.entries()) {
    const pattern = typeof rule?.pattern === "string" ? rule.pattern.trim() : "";
    const category = typeof rule?.category === "string" ? rule.category : "";
    if (pattern === "") {
      return { ok: false, message: `${index + 1}行目: 正規表現が空です` };
    }
    if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
      return {
        ok: false,
        message: `${index + 1}行目: 正規表現が長すぎます（${MAX_REGEX_PATTERN_LENGTH}文字以内）`,
      };
    }
    try {
      new RegExp(pattern);
    } catch {
      return { ok: false, message: `${index + 1}行目: 正規表現として不正です（${pattern}）` };
    }
    if (hasNestedQuantifier(pattern)) {
      return {
        ok: false,
        message: `${index + 1}行目: 入れ子の量指定子（例: (a+)+）は処理が極端に遅くなるため使えません`,
      };
    }
    if (!(ACCOUNT_NAMES as readonly string[]).includes(category)) {
      return { ok: false, message: `${index + 1}行目: 科目「${category}」は勘定科目にありません` };
    }
    rules.push({ pattern, category });
  }
  return { ok: true, rules };
}
