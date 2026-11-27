/**
 * agentModelGateway.ts — 対話エージェント用 LLM への接続点（gateways）。
 *
 * 外部APIの呼び方（CODING_CONVENTIONS_BACKEND「Gateways」）の選択理由:
 *   接続先は AGENT_BASE_URL で差し替え可能な OpenAI互換エンドポイント
 *   （OpenCode Go 等）と Anthropic Messages API の2系統。ツール呼び出しを
 *   含む会話制御は Vercel AI SDK に任せ（公式SDKに相当する第1選択肢）、
 *   ここでは設定 → LanguageModel の生成だけを担う。
 *
 * 送信ヘッダーの注意（互換性要件）:
 *   - User-Agent は USER_AGENT を明示する（userAgent.ts）。
 *   - OpenCode Go は x-opencode-session ヘッダーが無いリクエストを拒否する
 *     （MissingSessionID）ため、OpenAI互換では常に送る。他のエンドポイント
 *     では無視される。セッションIDはモデル生成ごとに新規発行する
 *     （会話履歴はリクエストに毎回含めるため、状態はサーバー側に持たせない）。
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LanguageModel } from "ai";
import { AgentConfig } from "../lib/config";
import { USER_AGENT } from "./userAgent";

/**
 * リダイレクトを追わない fetch。接続先は利用者が指定できるため、検証済みの
 * 宛先からリダイレクトで内部アドレスへ誘導されないよう、失敗にする。
 */
const fetchWithoutRedirect: typeof fetch = Object.assign(
  (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    fetch(input, { ...init, redirect: "error" }),
  // AI SDK の fetch 型（Bun の fetch）に合わせるため、付随するプロパティを引き継ぐ
  { preconnect: fetch.preconnect },
);

/** エージェント設定から AI SDK のモデルを生成する（gateways の入口）。 */
export function createAgentModel(config: AgentConfig): LanguageModel {
  const apiKey = config.requireKey();
  if (config.schema === "claude") {
    // Anthropic プロバイダは /v1 まで含めたベースURLを期待する。
    const baseURL = config.baseUrl.endsWith("/v1") ? config.baseUrl : `${config.baseUrl}/v1`;
    const provider = createAnthropic({ apiKey, baseURL, fetch: fetchWithoutRedirect });
    return provider(config.model);
  }
  const provider = createOpenAICompatible({
    name: "agent-endpoint",
    baseURL: config.baseUrl,
    apiKey,
    headers: {
      "x-opencode-session": crypto.randomUUID(),
      "User-Agent": USER_AGENT,
    },
    fetch: fetchWithoutRedirect,
  });
  return provider(config.model);
}
