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
 *   ETAX_DATA_DIR : 運用データ（アップロードファイル・学習履歴・
 *                   freee試算表）の置き場。未指定なら packages/server/data。
 *   DATABASE_URL  : PostgreSQL の接続文字列（DB機能に必須）。
 */
import { join } from "node:path";
import { ownerIdForWrite } from "./tenantContext";

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

/** 所有者ごとの SystemOne 設定の上書き（テナント分離）。 */
const systemOneOverridesByOwner = new Map<number, SystemOneOverrides>();

/** 保存済み設定の上書きを差し替える（現在のテナントの所有者として保持する）。 */
export function setSystemOneOverrides(overrides: SystemOneOverrides): void {
  setSystemOneOverridesForOwner(ownerIdForWrite(), overrides);
}

/** 所有者を指定して上書きを差し替える（起動時の全所有者読み込み用）。 */
export function setSystemOneOverridesForOwner(
  ownerId: number,
  overrides: SystemOneOverrides,
): void {
  systemOneOverridesByOwner.set(ownerId, overrides);
}

/** 現在のテナントの上書き（保存済み設定）を読む。 */
export function getSystemOneOverrides(): SystemOneOverrides {
  return systemOneOverridesByOwner.get(ownerIdForWrite()) ?? {};
}

/**
 * 設定画面で編集された jev 用プロンプトの上書き（空文字＝未設定）。
 * 設定がある間は、学習履歴から自動生成されるプロンプトより優先される。
 * 所有者ごとに保持する（テナント分離）。
 */
const jevPromptOverrideByOwner = new Map<number, string>();

/** 保存済みの jev 用プロンプト上書きを差し替える（jevPromptRepository が使う）。 */
export function setJevPromptOverride(prompt: string): void {
  setJevPromptOverrideForOwner(ownerIdForWrite(), prompt);
}

/** 所有者を指定して jev 用プロンプト上書きを差し替える（起動時の全所有者読み込み用）。 */
export function setJevPromptOverrideForOwner(ownerId: number, prompt: string): void {
  jevPromptOverrideByOwner.set(ownerId, prompt);
}

/** 現在のテナントの jev 用プロンプト上書きを読む（未設定なら空文字）。 */
export function getJevPromptOverride(): string {
  return jevPromptOverrideByOwner.get(ownerIdForWrite()) ?? "";
}

/**
 * 設定画面で編集された正規表現ルールの上書き（null＝未設定）。
 * 設定がある間は、学習履歴から自動生成されるルールより優先される
 * （実効ルールはこのリストそのものになる）。所有者ごとに保持する。
 */
const regexRulesOverrideByOwner = new Map<
  number,
  { pattern: string; category: string }[] | null
>();

/** 保存済みの正規表現ルール上書きを差し替える（regexRulesRepository が使う）。 */
export function setRegexRulesOverride(
  rules: { pattern: string; category: string }[] | null,
): void {
  setRegexRulesOverrideForOwner(ownerIdForWrite(), rules);
}

/** 所有者を指定して正規表現ルール上書きを差し替える（起動時の全所有者読み込み用）。 */
export function setRegexRulesOverrideForOwner(
  ownerId: number,
  rules: { pattern: string; category: string }[] | null,
): void {
  regexRulesOverrideByOwner.set(ownerId, rules);
}

/** 現在のテナントの正規表現ルール上書きを読む（未設定なら null）。 */
export function getRegexRulesOverride(): { pattern: string; category: string }[] | null {
  return regexRulesOverrideByOwner.get(ownerIdForWrite()) ?? null;
}

/**
 * 接続先（baseUrl）と API キーの出所を揃える（サーバーのキーの漏洩対策）。
 *
 * ユーザーが指定した baseUrl へは、サーバー環境変数のキーを決して
 * 送らない。カスタム baseUrl には、ユーザー自身が設定したキーだけを
 * 組み合わせる（無ければキー無し）。カスタム baseUrl がサーバー設定と
 * 同じ宛先を指す場合に限り、サーバーのキーをフォールバックに使える。
 */
export function pairApiKeyWithBaseUrl(args: {
  /** ユーザーが指定した baseUrl（未指定なら undefined / 空）。 */
  customBaseUrl?: string | null;
  /** サーバー設定（環境変数・デフォルト）の baseUrl。 */
  serverBaseUrl: string;
  /** ユーザー自身が設定したキー（未設定なら undefined / 空）。 */
  userKey?: string | null;
  /** サーバー設定（環境変数）のキー。 */
  serverKey: string | null;
}): { baseUrl: string; apiKey: string | null } {
  const serverBaseUrl = args.serverBaseUrl.replace(/\/+$/, "");
  const custom = args.customBaseUrl?.trim().replace(/\/+$/, "") || null;
  const userKey = args.userKey?.trim() || null;
  if (custom && custom !== serverBaseUrl) {
    return { baseUrl: custom, apiKey: userKey };
  }
  return { baseUrl: serverBaseUrl, apiKey: userKey ?? args.serverKey };
}

/**
 * SystemOne 互換エンドポイントの設定を読み込む。
 * 設定画面で保存された値があれば、環境変数より優先する。
 * ただし baseUrl がユーザー指定のカスタム宛先の場合、環境変数の
 * SYSTEMONE_API_KEY は送らない（pairApiKeyWithBaseUrl）。
 */
export function loadSystemOneConfig(): SystemOneConfig {
  const overrides = getSystemOneOverrides();
  const serverBaseUrl = process.env.SYSTEMONE_BASE_URL || "http://127.0.0.1:11434";
  const paired = pairApiKeyWithBaseUrl({
    customBaseUrl: overrides.baseUrl,
    serverBaseUrl,
    userKey: overrides.apiKey,
    serverKey: process.env.SYSTEMONE_API_KEY || null,
  });
  return {
    baseUrl: paired.baseUrl,
    apiKey: paired.apiKey,
    model: overrides.model || process.env.SYSTEMONE_MODEL || null,
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
// ファイルストレージの設定
// ---------------------------------------------------------------------------

/**
 * ストレージドライバ。
 * - local: データフォルダ配下のローカルフォルダ（開発・未設定時の既定）。
 * - s3: S3互換ストレージ（本番は Garage）。アップロード/表示は署名付きURLで
 *   ブラウザがストレージと直接やり取りし、APIサーバーはバイト列を経由しない。
 */
export type StorageDriver = "local" | "s3";

export interface S3StorageConfig {
  /** ブラウザから到達できる公開エンドポイント。署名付きURLはこのホストで発行する。 */
  endpoint: string;
  /** サーバー自身の操作用エンドポイント（compose 内のサービス名など）。未設定なら endpoint。 */
  internalEndpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Garage のリージョンは "garage" 固定。 */
  region: string;
}

export interface StorageConfig {
  driver: StorageDriver;
  /** アップロードファイルの保存先フォルダ（データフォルダ配下の files）。local 用。 */
  filesDir: string;
  /** s3 ドライバの設定。driver が s3 で必須項目が欠ける場合は null（未設定）。 */
  s3: S3StorageConfig | null;
  /** ストレージが使える状態か（s3 で必須項目が欠けていれば false）。 */
  configured: boolean;
}

/** ファイルストレージの設定を環境変数から返す。 */
export function loadStorageConfig(): StorageConfig {
  const filesDir = join(serverDataDir(), "files");
  if (process.env.ETAX_STORAGE_DRIVER !== "s3") {
    return { driver: "local", filesDir, s3: null, configured: true };
  }
  const endpoint = process.env.ETAX_STORAGE_S3_ENDPOINT ?? "";
  const bucket = process.env.ETAX_STORAGE_S3_BUCKET ?? "";
  const accessKeyId = process.env.ETAX_STORAGE_S3_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.ETAX_STORAGE_S3_SECRET_ACCESS_KEY ?? "";
  const configured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
  return {
    driver: "s3",
    filesDir,
    s3: configured
      ? {
          endpoint,
          internalEndpoint: process.env.ETAX_STORAGE_S3_INTERNAL_ENDPOINT || endpoint,
          bucket,
          accessKeyId,
          secretAccessKey,
          region: process.env.ETAX_STORAGE_S3_REGION || "garage",
        }
      : null,
    configured,
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
