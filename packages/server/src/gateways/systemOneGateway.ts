/**
 * systemOneGateway.ts — SystemOne 互換の判定モデルAPIへの接続点（gateways）。
 *
 * SystemOne は文章を生成するLLMではなく、文章（state）と型つきの質問を渡すと
 * 選択肢ごとの校正された確率を返す「判定モデル」のAPI形式:
 *   POST {baseUrl}/v1/systemone
 *   { state, questions: { <名前>: { type: "choice", instructions, criteria } }, model? }
 * 接続先は差し替え可能（TypeSafe Jev / Liquid d1 / Ollama の判定モデル /
 * sokudan の互換サーバー等）。公式SDKは接続先ごとに存在しないため、
 * llmGateway と同じく規約の第3選択肢「fetch＋zod検証」を採用する。
 * 応答形式は実装ごとに揺れがあるため、確率分布の在り処をゆるく検証して吸収する。
 */
import { z } from "@hono/zod-openapi";
import { AccountCriterion } from "@etax/shared";
import { SystemOneConfig } from "../lib/config";

/** SystemOne 呼び出しの失敗を表す例外。 */
export class SystemOneError extends Error {}

export interface AccountJudgement {
  /** 科目名 → 確率（0..1）。 */
  probabilities: Record<string, number>;
  /** 確率最大の科目。分布が空なら null。 */
  top: string | null;
}

export interface SystemOneClient {
  /**
   * 摘要テキストがどの勘定科目に当たるかを判定する。
   * learnedPrompt（学習履歴から自動生成した適用ルールと確定例の文章）が
   * あれば、判定プロンプトの指示文に組み込んで渡す（個別の修正を学習と
   * して判定に活かすため）。
   */
  judgeAccount(
    state: string,
    accounts: readonly AccountCriterion[],
    learnedPrompt?: string,
  ): Promise<AccountJudgement>;
}

const USER_AGENT = "etax-agent/0.1";

/**
 * choice 質問の候補数の上限。判定モデル側の制約（tev1 は最大24候補で、
 * 超えると 400 になる）。科目一覧がこれを超える場合は、領収書や明細行の
 * 摘要には現れない仕訳専用の科目（減価償却費・貸倒金）から外して収める。
 * 科目一覧そのもの（画面の選択肢）は削らない。
 */
const MAX_CHOICE_CANDIDATES = 24;
const JOURNAL_ONLY_ACCOUNTS: readonly string[] = ["減価償却費", "貸倒金"];

function capCandidates(
  accounts: readonly AccountCriterion[],
): readonly AccountCriterion[] {
  if (accounts.length <= MAX_CHOICE_CANDIDATES) return accounts;
  const trimmed = accounts.filter((a) => !JOURNAL_ONLY_ACCOUNTS.includes(a.account));
  return trimmed.slice(0, MAX_CHOICE_CANDIDATES);
}

/** 応答エンベロープ（実装差を吸収するため使う部分だけをゆるく検証する）。 */
const systemOneResponseSchema = z.looseObject({
  answers: z.record(z.string(), z.unknown()).optional(),
  answer: z.unknown().optional(),
});

/** 1つの choice 回答から確率分布を取り出す（フィールド名の揺れを吸収する）。 */
function extractProbabilities(answer: unknown): Record<string, number> {
  if (typeof answer !== "object" || answer === null) return {};
  const record = answer as Record<string, unknown>;
  const raw =
    record["probabilities"] ?? record["distribution"] ?? record["scores"] ?? record["probs"];
  if (typeof raw !== "object" || raw === null) return {};
  const probabilities: Record<string, number> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isFinite(value)) probabilities[name] = value;
  }
  return probabilities;
}

/** 1つの choice 回答から最上位の選択肢名を取り出す（無ければ確率最大で決める）。 */
function extractTop(answer: unknown, probabilities: Record<string, number>): string | null {
  if (typeof answer === "object" && answer !== null) {
    const record = answer as Record<string, unknown>;
    for (const field of ["choice", "answer", "value", "label"]) {
      const value = record[field];
      if (typeof value === "string" && value) return value;
    }
  }
  let top: string | null = null;
  let best = -Infinity;
  for (const [name, probability] of Object.entries(probabilities)) {
    if (probability > best) {
      best = probability;
      top = name;
    }
  }
  return top;
}

class SystemOneHttpClient implements SystemOneClient {
  constructor(private config: SystemOneConfig) {}

  async judgeAccount(
    state: string,
    accounts: readonly AccountCriterion[],
    learnedPrompt?: string,
  ): Promise<AccountJudgement> {
    const criteria: Record<string, string> = {};
    for (const { account, criteria: text } of capCandidates(accounts)) criteria[account] = text;
    const baseInstructions = "この支出または収入は、どの勘定科目に該当しますか？";
    const instructions = learnedPrompt
      ? `${baseInstructions}\n${learnedPrompt}`
      : baseInstructions;
    const payload: Record<string, unknown> = {
      state,
      questions: {
        account: {
          type: "choice",
          instructions,
          criteria,
        },
      },
    };
    if (this.config.model) payload["model"] = this.config.model;
    const url = `${this.config.baseUrl}/v1/systemone`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify(payload),
        // 判定モデル（Ollama の tev1 等）はアイドル後にアンロードされ、
        // 初回はモデルの読み込み＋24候補の推論で 30 秒を超えることがある。
        // コールドスタートでも失敗にしないよう長めに取る。
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      throw new SystemOneError(
        `接続失敗 ${url}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!resp.ok) {
      const body = (await resp.text()).slice(0, 500);
      throw new SystemOneError(`HTTP ${resp.status} ${url}: ${body}`);
    }
    const data = (await resp.json()) as Record<string, unknown>;
    const envelope = systemOneResponseSchema.safeParse(data);
    const answers = envelope.success ? envelope.data.answers : undefined;
    const answer = answers?.["account"] ?? (envelope.success ? envelope.data.answer : undefined) ?? data;
    const probabilities = extractProbabilities(answer);
    if (Object.keys(probabilities).length === 0) {
      throw new SystemOneError(`応答に確率分布が含まれていません: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return { probabilities, top: extractTop(answer, probabilities) };
  }
}

/** 設定から SystemOne クライアントを作る（gateways の入口）。 */
export function createSystemOneClient(config: SystemOneConfig): SystemOneClient {
  return new SystemOneHttpClient(config);
}
