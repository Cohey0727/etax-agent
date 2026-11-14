/**
 * config.ts — 環境変数からエージェント設定を読み込む（lib: 共通インスタンス/設定）。
 *
 * 環境変数:
 *   AGENT_SCHEMA   : "claude" または "openai"（デフォルト: openai）
 *   AGENT_API_KEY  : APIキー（計算系エンドポイントでは不要、LLM機能でのみ必須）
 *   AGENT_BASE_URL : 任意。エンドポイントの上書き
 *   AGENT_MODEL    : 任意。モデル名の上書き
 *
 * スキーマの意味:
 *   - openai : OpenAI 互換 Chat Completions API。
 *              デフォルトは OpenRouter (https://openrouter.ai/api/v1)。
 *              AGENT_BASE_URL を差し替えれば OpenCode 等の互換エンドポイントでも動く。
 *   - claude : Anthropic Messages API (https://api.anthropic.com)。
 */

/** 設定不備を表す例外。instanceof 判定のための慣用としてクラスで定義する。 */
export class ConfigError extends Error {}

export type AgentSchema = "openai" | "claude";

const agentDefaults: Record<AgentSchema, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  claude: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
};

export interface AgentConfig {
  schema: AgentSchema;
  apiKey: string | null;
  baseUrl: string;
  model: string;
  /** APIキーが必要な場面で呼ぶ。未設定なら分かりやすいエラーを投げる。 */
  requireKey(): string;
}

/**
 * 環境変数からエージェント設定を読み込む。
 * AGENT_SCHEMA が不正な場合は ConfigError を投げる（必須チェックは使用時に行う）。
 */
export function loadAgentConfig(): AgentConfig {
  const schemaRaw = (process.env.AGENT_SCHEMA || "openai").trim().toLowerCase();
  if (schemaRaw !== "openai" && schemaRaw !== "claude") {
    throw new ConfigError(
      `AGENT_SCHEMA の値が不正です: ${JSON.stringify(schemaRaw)}（'claude' か 'openai' を指定してください）`,
    );
  }
  const schema = schemaRaw as AgentSchema;
  const defaults = agentDefaults[schema];
  const cfg: AgentConfig = {
    schema,
    apiKey: process.env.AGENT_API_KEY || null,
    baseUrl: (process.env.AGENT_BASE_URL || defaults.baseUrl).replace(/\/+$/, ""),
    model: process.env.AGENT_MODEL || defaults.model,
    requireKey() {
      if (!this.apiKey) {
        throw new ConfigError(
          "AGENT_API_KEY が設定されていません。\n" +
            "  例: AGENT_SCHEMA=openai AGENT_API_KEY=sk-... を環境変数に設定してください。\n" +
            "（集計・税額計算だけならキー不要です）",
        );
      }
      return this.apiKey;
    },
  };
  return cfg;
}
