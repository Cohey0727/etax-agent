/**
 * classifyAccount.ts — 勘定科目の判定（services/classification）。
 *
 * 判定の優先順位:
 *   1. 生成ルール: 学習履歴から自動生成した正規表現ルール（generateRules）。
 *      決定的に当たるため、引っ掛かればそのまま自動で対応する。
 *   2. SystemOne: 正規表現で決められないものを、判定モデルAPI
 *      （/v1/systemone）に choice 質問として投げ、科目ごとの確率分布を
 *      得る。その際、生成ルールと確定例を文章化したプロンプト
 *      （generateRules の jevPrompt）を判定プロンプトに組み込む。
 *      設定画面で手編集されたプロンプト（jevPromptOverride）があれば、
 *      自動生成よりそちらを優先する。接続できない/未設定なら静かに次へ落ちる。
 *   3. キーワードルール: shared の CATEGORY_RULES による決定的な推定。
 *   4. どれにも当たらなければ「未分類」。
 *
 * 学習履歴は生成ルールとプロンプトの材料としてだけ使い、直接照合はしない。
 * 依存（履歴・SystemOneクライアント）は引数で受け取る（規約: services は
 * 依存を引数で受ける純粋な業務関数として書く）。
 */
import { ACCOUNT_CRITERIA, suggestCategory } from "@etax/shared";
import { SystemOneClient } from "../../gateways/systemOneGateway";
import { ClassificationHistoryRecord } from "../../repositories/classificationHistoryRepository";
import { generateRules, matchGeneratedRule } from "./generateRules";

export type ClassificationSource = "generated" | "systemone" | "rules" | "none";

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
  /** 設定画面で手編集された jev 用プロンプト。非空なら自動生成より優先する。 */
  jevPromptOverride?: string;
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
  // 学習履歴から適用ルールを自動生成する（正規表現ルール＋jev用プロンプト）。
  // 履歴が変われば生成結果も変わるため、判定のたびに作り直す。
  // 履歴そのものを直接照合はしない（材料としてだけ使う）。
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
      // 手編集されたプロンプトがあれば、自動生成よりそちらを優先する。
      const jevPrompt = deps.jevPromptOverride?.trim() ? deps.jevPromptOverride : generated.jevPrompt;
      const judgement = await deps.systemOne.judgeAccount(
        state,
        ACCOUNT_CRITERIA,
        jevPrompt || undefined,
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
