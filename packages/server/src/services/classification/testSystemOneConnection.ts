/**
 * testSystemOneConnection.ts — SystemOne（jev）接続テストの本体
 * （services/classification）。
 *
 * REST（usecases/testSystemOneSettings）と MCP（test_systemone_connection
 * ツール）が共用する。フォームの未保存の値でもテストできるよう、渡された
 * 項目だけ現在の有効値に上書きしてダミー判定を1回投げる。
 */
import { ACCOUNT_CRITERIA } from "@etax/shared";
import { createSystemOneClient } from "../../gateways/systemOneGateway";
import {
  getSystemOneOverrides,
  loadSystemOneConfig,
  pairApiKeyWithBaseUrl,
  SystemOneConfig,
} from "../../lib/config";
import { assertSafeUserBaseUrl } from "../../lib/ssrfGuard";
import { TestSystemOneSettingsResponse } from "../../schemas/systemOneSettings";

/** 接続テストへの上書き入力（省略した項目は現在の有効値でテストする）。 */
export interface TestSystemOneConnectionInput {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

/** SystemOne への接続テスト。失敗しても例外にせず ok=false で返す。 */
export async function testSystemOneConnection(
  input: TestSystemOneConnectionInput,
): Promise<TestSystemOneSettingsResponse> {
  const effective = loadSystemOneConfig();
  const overrides = getSystemOneOverrides();
  // 宛先とキーの出所を揃える: カスタム宛先（入力値または保存済み）には
  // ユーザー自身のキーだけを組み合わせ、環境変数のキーは送らない。
  const customBaseUrl = input.baseUrl?.trim() || overrides.baseUrl || null;
  if (customBaseUrl) {
    try {
      await assertSafeUserBaseUrl(customBaseUrl);
    } catch (e) {
      return {
        ok: false,
        top: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  const paired = pairApiKeyWithBaseUrl({
    customBaseUrl,
    serverBaseUrl: process.env.SYSTEMONE_BASE_URL || "http://127.0.0.1:11434",
    userKey: input.apiKey?.trim() || overrides.apiKey || null,
    serverKey: process.env.SYSTEMONE_API_KEY || null,
  });
  const config: SystemOneConfig = {
    baseUrl: paired.baseUrl,
    apiKey: paired.apiKey,
    model: input.model?.trim() ? input.model.trim() : effective.model,
  };
  try {
    const client = createSystemOneClient(config);
    const judgement = await client.judgeAccount("コーヒー 打ち合わせ", ACCOUNT_CRITERIA);
    return { ok: true, top: judgement.top, error: null };
  } catch (e) {
    return {
      ok: false,
      top: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
