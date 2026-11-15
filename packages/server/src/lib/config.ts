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
 *
 * 科目判定（SystemOne）用の環境変数:
 *   SYSTEMONE_BASE_URL : /v1/systemone 互換エンドポイントのベースURL
 *                        （デフォルト: http://127.0.0.1:11434 = ローカルの Ollama）
 *   SYSTEMONE_API_KEY  : 任意。クラウドの判定API（TypeSafe Jev / Liquid d1 等）用
 *   SYSTEMONE_MODEL    : 任意。判定モデル名の上書き
 *
 * データフォルダの環境変数:
 *   ETAX_DATA_DIR : 運用データ（SQLite DB・アップロードファイル・学習履歴・
 *                   freee試算表）の置き場。未指定なら packages/server/data。
 *   ETAX_DB_FILE  : 任意。SQLite ファイルのパスの上書き。
 */
import { join } from "node:path";

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

// ---------------------------------------------------------------------------
// SystemOne（判定モデルAPI）の設定
// ---------------------------------------------------------------------------

export interface SystemOneConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string | null;
}

/** 設定画面から保存された SystemOne 設定の上書き（空の項目は環境変数を使う）。 */
export interface SystemOneOverrides {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

let systemOneOverrides: SystemOneOverrides = {};

/** 保存済み設定の上書きを差し替える（systemOneSettingsRepository が使う）。 */
export function setSystemOneOverrides(overrides: SystemOneOverrides): void {
  systemOneOverrides = overrides;
}

/** 現在の上書き（保存済み設定）を読む。 */
export function getSystemOneOverrides(): SystemOneOverrides {
  return systemOneOverrides;
}

/**
 * 設定画面で編集された jev 用プロンプトの上書き（空文字＝未設定）。
 * 設定がある間は、学習履歴から自動生成されるプロンプトより優先される。
 */
let jevPromptOverride = "";

/** 保存済みの jev 用プロンプト上書きを差し替える（jevPromptRepository が使う）。 */
export function setJevPromptOverride(prompt: string): void {
  jevPromptOverride = prompt;
}

/** 現在の jev 用プロンプト上書きを読む（未設定なら空文字）。 */
export function getJevPromptOverride(): string {
  return jevPromptOverride;
}

/**
 * SystemOne 互換エンドポイントの設定を読み込む。
 * 設定画面で保存された値があれば、環境変数より優先する。
 */
export function loadSystemOneConfig(): SystemOneConfig {
  return {
    baseUrl: (
      systemOneOverrides.baseUrl ||
      process.env.SYSTEMONE_BASE_URL ||
      "http://127.0.0.1:11434"
    ).replace(/\/+$/, ""),
    apiKey: systemOneOverrides.apiKey || process.env.SYSTEMONE_API_KEY || null,
    model: systemOneOverrides.model || process.env.SYSTEMONE_MODEL || null,
  };
}

/**
 * サーバー側データファイルの置き場。
 * 既定は packages/server/data。ETAX_DATA_DIR があればそちらを使う
 * （デスクトップ同梱時はアプリのデータフォルダを指す）。
 * freee試算表の実績データや科目判定の学習履歴など、Git管理しない
 * 運用データを置く（.gitignore 対象）。
 */
export function serverDataDir(): string {
  return process.env.ETAX_DATA_DIR || join(import.meta.dirname, "../../data");
}

// ---------------------------------------------------------------------------
// ファイルストレージ（ローカルフォルダ）の設定
// ---------------------------------------------------------------------------

export interface StorageConfig {
  /** アップロードファイルの保存先フォルダ（データフォルダ配下の files）。 */
  filesDir: string;
  /** ローカル保存のため常時 true（将来の外部ストレージ再導入に備えた形）。 */
  configured: boolean;
}

/** ファイルストレージの設定を返す。保存先はデータフォルダ配下に固定する。 */
export function loadStorageConfig(): StorageConfig {
  return {
    filesDir: join(serverDataDir(), "files"),
    configured: true,
  };
}

// ---------------------------------------------------------------------------
// MCP（外部エージェント連携）の設定
// ---------------------------------------------------------------------------

export interface McpConfig {
  /**
   * /mcp エンドポイントの Bearer トークン。MCP_TOKEN で設定する。
   * 未設定なら認証なしで受ける（ローカル前提。公開する場合は必ず設定する）。
   */
  token: string;
}

/** MCP エンドポイントの設定を返す。 */
export function loadMcpConfig(): McpConfig {
  return { token: process.env.MCP_TOKEN ?? "" };
}
