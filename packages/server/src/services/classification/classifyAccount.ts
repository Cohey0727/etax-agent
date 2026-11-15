/**
 * classifyAccount.ts — 勘定科目の判定（services/classification）。
 *
 * 判定の優先順位:
 *   1. 過去の傾向: ユーザーが過去に確定した「摘要 → 科目」の学習履歴。
 *      同じ支払先・摘要が再び来たら、履歴の科目を高い確信度で返す。
 *   2. 生成ルール: 学習履歴から自動生成した正規表現ルール（generateRules）。
 *      個別の変更が貯まるほど、判定モデルなしで決定的に当たる範囲が広がる。
 *   3. SystemOne: 判定モデルAPI（/v1/systemone）に choice 質問として投げ、
 *      科目ごとの確率分布を得る。その際、生成ルールと確定例を文章化した
 *      プロンプト（generateRules の jevPrompt）を判定プロンプトに組み込む。
 *      接続できない/未設定なら静かに次へ落ちる。
 *   4. キーワードルール: shared の CATEGORY_RULES による決定的な推定。
 *   5. どれにも当たらなければ「未分類」。
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
import { generateRules, matchGeneratedRule } from "./generateRules";

export type ClassificationSource = "history" | "generated" | "systemone" | "rules" | "none";

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
  /** 判定モデルへ渡す state の前に付ける文脈（例: 「三井住友銀行・出金」）。 */
  stateHint?: string;
}

/**
 * 学習履歴から摘要に合う対応を探す。
 * 完全一致を最優先し、次に「キーを含む/キーに含まれる」部分一致を回数順で拾う。
 * 部分一致は、同じ対応が2回以上確定した「傾向」だけを対象にする。
 * 1回だけの確定を部分一致で広げると、短い摘要（店名など）が無関係な
 * 取引にまで伝播してしまうため。
 */
export function matchHistory(
  description: string,
  history: ClassificationHistoryRecord[],
): ClassificationHistoryRecord | null {
  const key = normalizeDescriptionKey(description);
  if (!key) return null;
  // 保存済みキーは正規化の形式が古い場合があるため、摘要から作り直して比べる。
  const keyed = history.map((record) => ({
    record,
    key: normalizeDescriptionKey(record.description),
  }));
  const exact = keyed
    .filter((entry) => entry.key === key)
    .sort((a, b) => b.record.count - a.record.count)[0];
  if (exact) return exact.record;
  const partial = keyed
    .filter(
      (entry) =>
        entry.record.count >= 2 &&
        entry.key.length >= 2 &&
        (key.includes(entry.key) || entry.key.includes(key)),
    )
    .sort((a, b) => b.record.count - a.record.count || b.key.length - a.key.length)[0];
  return partial?.record ?? null;
}

/**
 * 店舗らしい摘要か（店名・業態のキーワードで判定する）。
 * 判定モデルは店舗名を地代家賃に寄せる偏りがあり、プロンプトの注意書き
 * だけでは止めきれないため、決定的な歯止めとして使う。
 */
const STORE_LIKE_KEYS: readonly string[] = [
  "セブン-イレブン",
  "セブンイレブン",
  "ローソン",
  "ファミリーマート",
  "ミニストップ",
  "デイリーヤマザキ",
  "ハローズ",
  "イオン",
  "ゆめタウン",
  "エブリイ",
  "ユーホー",
  "ザグザグ",
  "ダイレックス",
  "ウエルシア",
  "サンドラッグ",
  "ドラッグ",
  "ドン・キホーテ",
  "ダイソー",
  "ユニクロ",
  "アウトレット",
  "デパート",
  "ショッピング",
  "マート",
  "ストア",
  "マクドナルド",
  "スターバックス",
  "ガスト",
  "一蘭",
  "居酒屋",
  "焼肉",
  "レストラン",
  "食堂",
  "カフェ",
  "珈琲",
  "コーヒー",
  "寿司",
  "すし",
  "ラーメン",
  "うどん",
  "そば",
  "パスタ",
  "ピザ",
  "バーガー",
  "ドーナツ",
];

export function isStoreLikeDescription(description: string): boolean {
  return STORE_LIKE_KEYS.some((k) => description.includes(k));
}

/**
 * 判定結果の補正: 店舗名を「地代家賃」にするのは科目としてあり得ない
 * （地代家賃は不動産の賃借料だけ）ため、店舗らしい摘要で地代家賃に
 * なった場合は雑費に寄せる。
 */
export function guardStoreRent(account: string, description: string): string {
  if (account === "地代家賃" && isStoreLikeDescription(description)) return "雑費";
  return account;
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
  // 学習履歴から適用ルールを自動生成する（正規表現ルール＋jev用プロンプト）。
  // 履歴が変われば生成結果も変わるため、判定のたびに作り直す。
  const generated = generateRules(deps.history);
  const ruleHit = matchGeneratedRule(description, generated.regexRules);
  if (ruleHit) {
    return {
      account: ruleHit.category,
      confidence: null,
      source: "generated",
      candidates: [],
    };
  }
  if (deps.systemOne) {
    try {
      const state = deps.stateHint ? `【${deps.stateHint}】${description}` : description;
      const judgement = await deps.systemOne.judgeAccount(
        state,
        ACCOUNT_CRITERIA,
        generated.jevPrompt || undefined,
      );
      const candidates = Object.entries(judgement.probabilities)
        .map(([account, probability]) => ({ account, probability }))
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 5);
      const top = candidates[0];
      if (top) {
        return {
          account: guardStoreRent(judgement.top ?? top.account, description),
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
