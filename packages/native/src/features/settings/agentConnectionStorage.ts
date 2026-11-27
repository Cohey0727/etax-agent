import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { AgentConnectionConfig } from "@/api";

/** ユーザーを区別せず、APIキーも平文で入っている保存値のキー。読まずに消す。 */
const UNSCOPED_STORAGE_KEY = "etax.agent-connection";

export const EMPTY_AGENT_CONNECTION: AgentConnectionConfig = { baseUrl: "", model: "", apiKey: "" };

function userKey(userId: number | null): string {
  return userId === null ? "anon" : String(userId);
}

/** ベースURL・モデル（AsyncStorage）。 */
function settingsKey(userId: number | null): string {
  return `etax.agent-connection.${userKey(userId)}`;
}

/** APIキー（SecureStore。キーに使える文字は英数字と . - _ だけ）。 */
function apiKeyKey(userId: number | null): string {
  return `etax.agent-connection-key.${userKey(userId)}`;
}

/**
 * 外部接続（AI）の上書き設定をこの端末へ、ユーザーごとに保存する。
 * APIキーは端末の安全な保存領域（SecureStore）にだけ置く。
 */
export async function saveAgentConnection(
  userId: number | null,
  config: AgentConnectionConfig,
): Promise<void> {
  await AsyncStorage.setItem(
    settingsKey(userId),
    JSON.stringify({ baseUrl: config.baseUrl, model: config.model }),
  ).catch(() => undefined);
  try {
    if (config.apiKey) await SecureStore.setItemAsync(apiKeyKey(userId), config.apiKey);
    else await SecureStore.deleteItemAsync(apiKeyKey(userId));
  } catch {
    // 保存できなくても、この画面を開いている間の値はそのまま使える
  }
}

/** 保存済みの外部接続（AI）設定を読み込む。無ければ空の設定。 */
export async function loadAgentConnection(userId: number | null): Promise<AgentConnectionConfig> {
  await AsyncStorage.removeItem(UNSCOPED_STORAGE_KEY).catch(() => undefined);
  let baseUrl = "";
  let model = "";
  try {
    const raw = await AsyncStorage.getItem(settingsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AgentConnectionConfig>;
      baseUrl = typeof parsed.baseUrl === "string" ? parsed.baseUrl : "";
      model = typeof parsed.model === "string" ? parsed.model : "";
    }
  } catch {
    // 読めない保存値は未設定として扱う
  }
  const apiKey = (await SecureStore.getItemAsync(apiKeyKey(userId)).catch(() => null)) ?? "";
  return { baseUrl, model, apiKey };
}

/** 保存済みの外部接続（AI）設定と APIキーを消す（サインアウト時）。 */
export async function clearAgentConnection(userId: number | null): Promise<void> {
  await AsyncStorage.removeItem(settingsKey(userId)).catch(() => undefined);
  await SecureStore.deleteItemAsync(apiKeyKey(userId)).catch(() => undefined);
}
