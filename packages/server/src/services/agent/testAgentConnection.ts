/**
 * testAgentConnection.ts — 外部接続（AI）の接続テストの本体（services/agent）。
 *
 * REST（usecases/testAgentSettings）と MCP（test_agent_connection ツール）が
 * 共用する。設定画面の未保存の値でもテストできるよう、渡された項目だけ
 * サーバーの現在の設定に上書きして、最小の生成リクエストを1回投げる。
 * 上書きの規則は executeAgentChat の agentConfig 上書きと同じ。
 */
import { generateText } from "ai";
import { createAgentModel } from "../../gateways/agentModelGateway";
import { AgentConfig, loadAgentConfig, pairApiKeyWithBaseUrl } from "../../lib/config";
import { assertSafeUserBaseUrl } from "../../lib/ssrfGuard";
import { TestAgentSettingsResponse } from "../../schemas/agentSettings";

/** 接続テストへの上書き入力（省略した項目はサーバーの現在の設定を使う）。 */
export interface TestAgentConnectionInput {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 外部接続（AI）への接続テスト。失敗しても例外にせず ok=false で返す。 */
export async function testAgentConnection(
  input: TestAgentConnectionInput,
): Promise<TestAgentSettingsResponse> {
  let cfg: AgentConfig;
  try {
    cfg = loadAgentConfig();
  } catch (e) {
    return { ok: false, model: null, reply: null, error: errorText(e) };
  }
  // baseUrl がカスタム宛先ならサーバー環境変数のキーは組み合わせない
  // （キー漏洩防止）。カスタム宛先は SSRF 検証も行う。
  const customBaseUrl = input.baseUrl?.trim() ? input.baseUrl.trim() : null;
  if (customBaseUrl) {
    try {
      await assertSafeUserBaseUrl(customBaseUrl);
    } catch (e) {
      return { ok: false, model: cfg.model, reply: null, error: errorText(e) };
    }
  }
  const paired = pairApiKeyWithBaseUrl({
    customBaseUrl,
    serverBaseUrl: cfg.baseUrl,
    userKey: input.apiKey?.trim() || null,
    serverKey: cfg.apiKey,
  });
  cfg.baseUrl = paired.baseUrl;
  cfg.apiKey = paired.apiKey;
  if (input.model?.trim()) cfg.model = input.model.trim();
  if (!cfg.apiKey) {
    return {
      ok: false,
      model: cfg.model,
      reply: null,
      error: "APIキーが未設定です（サーバーの環境変数か、この画面で入力してください）",
    };
  }
  try {
    const result = await generateText({
      model: createAgentModel(cfg),
      prompt: "接続テストです。「OK」とだけ返してください。",
      abortSignal: AbortSignal.timeout(30_000),
    });
    return {
      ok: true,
      model: cfg.model,
      reply: result.text.trim().slice(0, 100) || null,
      error: null,
    };
  } catch (e) {
    return { ok: false, model: cfg.model, reply: null, error: errorText(e) };
  }
}
