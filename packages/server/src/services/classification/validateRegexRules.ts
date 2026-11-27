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
 * 量指定子つきのグループで、中に量指定子か選択（|）を含むもの
 * （例: (a+)+、((a+))+、(\d{2,})+、(a|aa)+）を検出する。
 * 破滅的バックトラック（ReDoS）の代表的な形で、ユーザー入力の正規表現を
 * 帳簿の摘要に当てる経路では処理を止められてしまうため保存時に弾く。
 * 内側のグループの量指定子・選択は外側のグループにも含まれるものとして扱う。
 * エスケープと文字クラスの中身は読み飛ばす。
 */
export function hasNestedQuantifier(pattern: string): boolean {
  const stack: { hasQuantifier: boolean; hasAlternation: boolean }[] = [];
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
      stack.push({ hasQuantifier: false, hasAlternation: false });
      continue;
    }
    if (ch === ")") {
      const group = stack.pop();
      if (!group) continue;
      if ((group.hasQuantifier || group.hasAlternation) && isQuantifierAt(pattern, i + 1)) {
        return true;
      }
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.hasQuantifier ||= group.hasQuantifier;
        parent.hasAlternation ||= group.hasAlternation;
      }
      continue;
    }
    const top = stack[stack.length - 1];
    if (ch === "|") {
      if (top) top.hasAlternation = true;
      continue;
    }
    if (isQuantifierAt(pattern, i) && top) top.hasQuantifier = true;
  }
  return false;
}

/** 繰り返し回数の幅がこれ以上ある {n,m} は、* や + と同じく数える。 */
const WIDE_REPEAT_SPAN = 10;

/** 繰り返し回数の幅が広い量指定子（*、+、{n,}、{n,m} で m−n が大きいもの）の位置か。 */
function isWideQuantifierAt(pattern: string, index: number): boolean {
  const ch = pattern[index];
  if (ch === "*" || ch === "+") return true;
  if (ch !== "{") return false;
  const close = pattern.indexOf("}", index);
  const matched = /^\{(\d+),(\d*)\}$/.exec(pattern.slice(index, close + 1));
  if (!matched) return false;
  if (matched[2] === "") return true;
  return Number(matched[2]) - Number(matched[1]) >= WIDE_REPEAT_SPAN;
}

/** パターン中の幅の広い量指定子の数（エスケープと文字クラスの中身は数えない）。 */
function countWideQuantifiers(pattern: string): number {
  let count = 0;
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
    if (isWideQuantifierAt(pattern, i)) count++;
  }
  return count;
}

/**
 * 学習履歴から自動生成されるルールと同じ形か: エスケープ済みの文字と
 * \d+ だけからなり、\d+ どうしの間に数字以外の文字が必ず挟まる。
 * この形は \d+ の取りうる範囲が重ならないため、量指定子の数によらず
 * バックトラックが膨らまない。
 */
function isDigitRunLiteral(pattern: string): boolean {
  let separatedSinceDigitRun = true;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      const next = pattern[i + 1];
      if (next === "d" && pattern[i + 2] === "+") {
        if (!separatedSinceDigitRun) return false;
        separatedSinceDigitRun = false;
        i += 2;
        continue;
      }
      if (next === undefined || /[0-9A-Za-z]/.test(next)) return false;
      separatedSinceDigitRun = true;
      i++;
      continue;
    }
    if (".*+?^${}()|[]".includes(ch)) return false;
    if (!/[0-9]/.test(ch)) separatedSinceDigitRun = true;
  }
  return true;
}

/**
 * 幅の広い量指定子の数の上限。範囲が重なる量指定子が並ぶと、照合に
 * 失敗する入力で照合時間が入力長のべき乗で増えるため（.*.*.*z など）、
 * 自動生成と同じ形でないパターンはこの数までに抑える。
 */
const MAX_WIDE_QUANTIFIERS = 2;

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
    if (!isDigitRunLiteral(pattern) && countWideQuantifiers(pattern) > MAX_WIDE_QUANTIFIERS) {
      return {
        ok: false,
        message: `${index + 1}行目: 繰り返し（* や + など）は処理が極端に遅くなるため${MAX_WIDE_QUANTIFIERS}個までしか使えません`,
      };
    }
    if (!(ACCOUNT_NAMES as readonly string[]).includes(category)) {
      return { ok: false, message: `${index + 1}行目: 科目「${category}」は勘定科目にありません` };
    }
    rules.push({ pattern, category });
  }
  return { ok: true, rules };
}
