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
 * ファイルストレージ（Garage / S3互換）用の環境変数:
 *   S3_PUBLIC_ENDPOINT   : 署名付きURLの発行先（ブラウザから到達できる公開URL）
 *   S3_INTERNAL_ENDPOINT : サーバー内部からの取得先（未指定なら公開URLを使う）
 *   S3_BUCKET            : バケット名（デフォルト: etax-files）
 *   S3_REGION            : リージョン（デフォルト: garage）
 *   S3_ACCESS_KEY_ID     : アクセスキー
 *   S3_SECRET_ACCESS_KEY : シークレットキー
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

/** 環境変数から SystemOne 互換エンドポイントの設定を読み込む。 */
export function loadSystemOneConfig(): SystemOneConfig {
  return {
    baseUrl: (process.env.SYSTEMONE_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    apiKey: process.env.SYSTEMONE_API_KEY || null,
    model: process.env.SYSTEMONE_MODEL || null,
  };
}

/**
 * サーバー側データファイルの置き場（packages/server/data）。
 * freee試算表の実績データや科目判定の学習履歴など、Git管理しない
 * 運用データを置く（.gitignore 対象）。
 */
export function serverDataDir(): string {
  return join(import.meta.dir, "../../data");
}

// ---------------------------------------------------------------------------
// ファイルストレージ（Garage / S3互換）の設定
// ---------------------------------------------------------------------------

export interface StorageConfig {
  /** 署名付きURLの発行に使う公開エンドポイント（ブラウザから到達できるURL）。 */
  publicEndpoint: string | null;
  /** サーバー内部からオブジェクトを取得するエンドポイント。 */
  internalEndpoint: string | null;
  bucket: string;
  region: string;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  /** URL発行と取得に必要な設定が揃っているか。 */
  configured: boolean;
}

/** 環境変数からファイルストレージの設定を読み込む。 */
export function loadStorageConfig(): StorageConfig {
  const publicEndpoint = (process.env.S3_PUBLIC_ENDPOINT || "").replace(/\/+$/, "") || null;
  const internalEndpoint =
    (process.env.S3_INTERNAL_ENDPOINT || "").replace(/\/+$/, "") || publicEndpoint;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || null;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || null;
  return {
    publicEndpoint,
    internalEndpoint,
    bucket: process.env.S3_BUCKET || "etax-files",
    region: process.env.S3_REGION || "garage",
    accessKeyId,
    secretAccessKey,
    configured: Boolean(publicEndpoint && internalEndpoint && accessKeyId && secretAccessKey),
  };
}
