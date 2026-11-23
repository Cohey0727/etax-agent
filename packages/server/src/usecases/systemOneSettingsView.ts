/**
 * systemOneSettingsView.ts — SystemOne接続設定のレスポンス整形（usecases 共通）。
 * 保存値と有効値（保存値 → 環境変数 → デフォルト）を並べ、APIキーは有無だけにする。
 */
import { SystemOneConfig, SystemOneOverrides } from "../lib/config";
import { SystemOneSettingsResponse } from "../schemas/systemOneSettings";

export function toSystemOneSettingsResponse(
  stored: SystemOneOverrides,
  effective: SystemOneConfig,
): SystemOneSettingsResponse {
  return {
    baseUrl: stored.baseUrl ?? "",
    model: stored.model ?? "",
    apiKeySet: Boolean(stored.apiKey) || Boolean(effective.apiKey),
    effectiveBaseUrl: effective.baseUrl,
    effectiveModel: effective.model,
  };
}
