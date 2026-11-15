/**
 * generateRules.ts — 学習履歴から「適用ルール」を自動生成する（services/classification）。
 *
 * 個別に確定・変更された分類（分類の学習履歴）が貯まると、ここで2種類の
 * ルールに編み直す:
 *   1. 正規表現ルール: 摘要のパターン → 勘定科目。判定モデルを使わず
 *      決定的に当てられるものは、こちらで即座に判定する。
 *   2. jev 用プロンプト: 一般化した適用ルールと個別の確定例を文章化した
 *      もの。SystemOne(jev) の判定プロンプトに組み込まれる。
 *
 * 生成は履歴を読むたびに行う（保存はしない）ため、個別の変更は次回の
 * 判定から即座に反映される。
 */
import {
  ClassificationHistoryRecord,
  normalizeDescriptionKey,
} from "../../repositories/classificationHistoryRepository";

/** 正規表現ルール1件（自動生成・手編集カスタム共通の最小形）。 */
export interface RegexRule {
  /** 正規表現のソース（正規化済み摘要への部分一致で使う）。 */
  pattern: string;
  /** このパターンに当てはまる摘要の勘定科目。 */
  category: string;
}

export interface GeneratedRegexRule extends RegexRule {
  /** 根拠になった確定回数の合計。 */
  count: number;
  /** 人間可読な代表例（元の摘要）。 */
  example: string;
}

export interface GeneratedRules {
  regexRules: GeneratedRegexRule[];
  /** jev の判定プロンプトに組み込む文章。履歴が無ければ空文字。 */
  jevPrompt: string;
}

const MAX_REGEX_RULES = 200;
const MAX_PROMPT_RULES = 15;
const MAX_PROMPT_EXAMPLES = 12;
/** 一般化した結果、意味のある文字列がこれ未満しか残らないパターンは捨てる。 */
const MIN_PATTERN_LITERAL_LENGTH = 3;

/** 正規表現の特殊文字をエスケープする。 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 摘要1件から正規表現パターンを作る: 正規化（空白・大小の吸収）→
 * 数字列を \d+ に一般化 → 特殊文字をエスケープ。
 * 数字だけのような当てすぎるパターンは null を返す。
 */
export function patternFromDescription(description: string): string | null {
  const normalized = normalizeDescriptionKey(description);
  const literalLength = normalized.replace(/\d+/g, "").trim().length;
  if (literalLength < MIN_PATTERN_LITERAL_LENGTH) return null;
  return escapeRegExp(normalized).replace(/\d+/g, "\\d+");
}

/**
 * 1件の履歴から候補パターンを作る。全文に加え、「 - 支店名」のような
 * サフィックスを落とした形も候補にする（チェーン店のまとめ判定用）。
 */
function candidatePatterns(description: string): string[] {
  const patterns: string[] = [];
  const full = patternFromDescription(description);
  if (full) patterns.push(full);
  const head = description.split(" - ")[0] ?? "";
  if (head && head !== description) {
    const headPattern = patternFromDescription(head);
    if (headPattern && headPattern !== full) patterns.push(headPattern);
  }
  return patterns;
}

/**
 * 学習履歴から適用ルール一式を生成する。
 * 同じパターンが複数の科目に割れている場合は、最多の科目が次点の2倍以上
 * のときだけ採用する（曖昧なパターンは判定モデルに委ねる）。
 */
export function generateRules(
  history: ClassificationHistoryRecord[],
): GeneratedRules {
  // パターン × 科目ごとに確定回数を集計する
  const byPattern = new Map<
    string,
    Map<string, { count: number; example: string }>
  >();
  for (const record of history) {
    for (const pattern of candidatePatterns(record.description)) {
      let byCategory = byPattern.get(pattern);
      if (!byCategory) {
        byCategory = new Map();
        byPattern.set(pattern, byCategory);
      }
      const entry = byCategory.get(record.account) ?? {
        count: 0,
        example: record.description,
      };
      entry.count += record.count;
      byCategory.set(record.account, entry);
    }
  }

  const regexRules: GeneratedRegexRule[] = [];
  for (const [pattern, byCategory] of byPattern) {
    const ranked = [...byCategory.entries()]
      .map(([category, v]) => ({ category, count: v.count, example: v.example }))
      .sort((a, b) => b.count - a.count);
    const top = ranked[0];
    if (!top) continue;
    const runnerUp = ranked[1];
    if (runnerUp && top.count < runnerUp.count * 2) continue; // 曖昧 → 採用しない
    regexRules.push({
      pattern,
      category: top.category,
      count: top.count,
      example: top.example,
    });
  }
  // 確定回数の多い順、同数なら長い（具体的な）パターン順に適用する
  regexRules.sort((a, b) => b.count - a.count || b.pattern.length - a.pattern.length);

  return {
    regexRules: regexRules.slice(0, MAX_REGEX_RULES),
    jevPrompt: buildJevPrompt(regexRules, history),
  };
}

/** 生成ルールと確定例から、jev の判定プロンプトに組み込む文章を作る。 */
function buildJevPrompt(
  regexRules: GeneratedRegexRule[],
  history: ClassificationHistoryRecord[],
): string {
  if (history.length === 0) return "";
  const sections: string[] = [];
  const strongRules = regexRules.filter((r) => r.count >= 2).slice(0, MAX_PROMPT_RULES);
  if (strongRules.length > 0) {
    sections.push(
      [
        "過去の確定例から自動生成した適用ルール:",
        ...strongRules.map(
          (r) => `- 「${r.example}」のような摘要は ${r.category}（${r.count}件の確定例）`,
        ),
      ].join("\n"),
    );
  }
  const examples = [...history]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_PROMPT_EXAMPLES);
  if (examples.length > 0) {
    sections.push(
      [
        "個別の確定例（摘要 → 勘定科目）:",
        ...examples.map((r) => `「${r.description}」→ ${r.account}`),
      ].join("\n"),
    );
  }
  return sections.join("\n");
}

/** 正規表現ルールに摘要が当たるか（先に並んだルールが優先）。 */
export function matchGeneratedRule(
  description: string,
  rules: readonly RegexRule[],
): RegexRule | null {
  const normalized = normalizeDescriptionKey(description);
  for (const rule of rules) {
    if (new RegExp(rule.pattern).test(normalized)) return rule;
  }
  return null;
}
