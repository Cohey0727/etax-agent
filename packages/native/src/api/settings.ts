/**
 * settings.ts — APIキー・MCP情報・SystemOne接続・分類ルール・プロンプトのAPI。
 */
import { apiJson } from "./client";
import {
  AgentTestResult,
  ApiKeyItem,
  CreatedApiKey,
  JevPromptInfo,
  McpInfo,
  RegexRuleItem,
  RegexRulesInfo,
  SystemOneSettings,
  SystemOneTestResult,
} from "./types";

/** 外部エージェント連携（MCP）用 API キーの一覧を取得する。 */
export async function fetchApiKeys(): Promise<ApiKeyItem[]> {
  return apiJson<ApiKeyItem[]>("/api/auth/api-keys");
}

/** API キーを発行する。平文キーはこの応答でしか返らない。 */
export async function createApiKey(
  name: string,
  expiresAt: string | null,
): Promise<CreatedApiKey> {
  return apiJson<CreatedApiKey>("/api/auth/api-keys", {
    method: "POST",
    body: { name, expires_at: expiresAt },
  });
}

/** API キーを失効させる。 */
export async function revokeApiKey(id: number): Promise<void> {
  await apiJson(`/api/auth/api-keys/${id}`, { method: "DELETE" });
}

/** MCP の接続情報（エンドポイントと公開ツール一覧）を取得する。 */
export async function fetchMcpInfo(): Promise<McpInfo> {
  return apiJson<McpInfo>("/api/auth/mcp-info");
}

/** SystemOne（jev）接続設定を取得する。 */
export async function fetchSystemOneSettings(): Promise<SystemOneSettings> {
  return apiJson<SystemOneSettings>("/api/settings/systemone");
}

/** SystemOne（jev）接続設定を保存する。apiKey は渡した時だけ差し替わる。 */
export async function updateSystemOneSettings(input: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
}): Promise<SystemOneSettings> {
  return apiJson<SystemOneSettings>("/api/settings/systemone", {
    method: "PUT",
    body: input,
  });
}

/** SystemOne（jev）への接続テスト。未保存の値でも試せる。 */
export async function testSystemOneSettings(input: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<SystemOneTestResult> {
  return apiJson<SystemOneTestResult>("/api/settings/systemone/test", {
    method: "POST",
    body: input,
  });
}

/** 外部接続（AI）への接続テスト。未保存の値でも試せる。 */
export async function testAgentSettings(input: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<AgentTestResult> {
  return apiJson<AgentTestResult>("/api/settings/agent/test", {
    method: "POST",
    body: input,
  });
}

/** 正規表現ルール一式を取得する。 */
export async function fetchRegexRules(): Promise<RegexRulesInfo> {
  return apiJson<RegexRulesInfo>("/api/classify/regex-rules");
}

/** 正規表現ルールを保存する（空配列でカスタムを消して自動生成に戻る）。 */
export async function updateRegexRules(rules: RegexRuleItem[]): Promise<RegexRulesInfo> {
  return apiJson<RegexRulesInfo>("/api/classify/regex-rules", {
    method: "PUT",
    body: { rules },
  });
}

/** jev用プロンプト一式を取得する。 */
export async function fetchJevPrompt(): Promise<JevPromptInfo> {
  return apiJson<JevPromptInfo>("/api/classify/jev-prompt");
}

/** jev用プロンプトを保存する（空文字でカスタムを消して自動生成に戻る）。 */
export async function updateJevPrompt(prompt: string): Promise<JevPromptInfo> {
  return apiJson<JevPromptInfo>("/api/classify/jev-prompt", {
    method: "PUT",
    body: { prompt },
  });
}
