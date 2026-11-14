/**
 * classifyAccount.ts — 勘定科目の判定（services/classification）。
 *
 * 判定の優先順位:
 *   1. 過去の傾向: ユーザーが過去に確定した「摘要 → 科目」の学習履歴。
 *      同じ支払先・摘要が再び来たら、履歴の科目を高い確信度で返す。
 *   2. SystemOne: 判定モデルAPI（/v1/systemone）に choice 質問として投げ、
 *      科目ごとの確率分布を得る。接続できない/未設定なら静かに次へ落ちる。
 *   3. キーワードルール: shared の CATEGORY_RULES による決定的な推定。
 *   4. どれにも当たらなければ「未分類」。
 *
 * 依存（履歴・SystemOneクライアント）は引数で受け取る（規約: services は
 * 依存を引数で受ける純粋な業務関数として書く）。
 */
import { ACCOUNT_CRITERIA, suggestCategory } from "@etax/shared";
import { SystemOneClient } from "../../gateways/systemOneGateway";
import {
  ClassificationHistoryRecord,
  normalizeDescriptionKey,
} from "../../repositories/classificationHistoryRepository";

export type ClassificationSource = "history" | "systemone" | "rules" | "none";

export interface AccountCandidate {
  account: string;
  probability: number;
}

export interface AccountClassification {
  account: string;
  /** 0..1 の確信度。ルール判定など確率が無い場合は null。 */
  confidence: number | null;
  source: ClassificationSource;
  /** 候補（確率の降順、最大5件）。 */
  candidates: AccountCandidate[];
}

export interface ClassifyAccountDeps {
  history: ClassificationHistoryRecord[];
  systemOne: SystemOneClient | null;
}

/**
 * 学習履歴から摘要に合う対応を探す。
 * 完全一致を最優先し、次に「キーを含む/キーに含まれる」部分一致を回数順で拾う。
 */
export function matchHistory(
  description: string,
  history: ClassificationHistoryRecord[],
): ClassificationHistoryRecord | null {
  const key = normalizeDescriptionKey(description);
  if (!key) return null;
  const exact = history
    .filter((r) => r.key === key)
    .sort((a, b) => b.count - a.count)[0];
  if (exact) return exact;
  const partial = history
    .filter((r) => r.key.length >= 2 && (key.includes(r.key) || r.key.includes(key)))
    .sort((a, b) => b.count - a.count || b.key.length - a.key.length)[0];
  return partial ?? null;
}

/** 1件の摘要について勘定科目を判定する。 */
export async function classifyAccount(
  description: string,
  deps: ClassifyAccountDeps,
): Promise<AccountClassification> {
  const hit = matchHistory(description, deps.history);
  if (hit) {
    const confidence = Math.min(0.99, 0.75 + 0.04 * hit.count);
    return {
      account: hit.account,
      confidence,
      source: "history",
      candidates: [{ account: hit.account, probability: confidence }],
    };
  }
  if (deps.systemOne) {
    try {
      const judgement = await deps.systemOne.judgeAccount(description, ACCOUNT_CRITERIA);
      const candidates = Object.entries(judgement.probabilities)
        .map(([account, probability]) => ({ account, probability }))
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 5);
      const top = candidates[0];
      if (top) {
        return {
          account: judgement.top ?? top.account,
          confidence: top.probability,
          source: "systemone",
          candidates,
        };
      }
    } catch (e) {
      // SystemOne に繋がらない環境ではキーワードルールへフォールバックする。
      // ただし理由はサーバーログに残す（無言だと設定ミスに気づけないため）。
      console.warn(
        `[classify] SystemOne判定に失敗しフォールバックします: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  const ruled = suggestCategory(description);
  if (ruled) {
    return { account: ruled, confidence: null, source: "rules", candidates: [] };
  }
  return { account: "未分類", confidence: null, source: "none", candidates: [] };
}
