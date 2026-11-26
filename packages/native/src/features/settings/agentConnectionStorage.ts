import AsyncStorage from "@react-native-async-storage/async-storage";
import { AgentConnectionConfig } from "@/api";

const STORAGE_KEY = "etax.agent-connection";

export const EMPTY_AGENT_CONNECTION: AgentConnectionConfig = { baseUrl: "", model: "", apiKey: "" };

/** 外部接続（AI）の上書き設定を端末へ保存する（APIキーはこの端末にだけ残る）。 */
export async function saveAgentConnection(config: AgentConnectionConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config)).catch(() => undefined);
}

/** 保存済みの外部接続（AI）設定を読み込む。無ければ空の設定。 */
export async function loadAgentConnection(): Promise<AgentConnectionConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_AGENT_CONNECTION;
    const parsed = JSON.parse(raw) as Partial<AgentConnectionConfig>;
    return {
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
    };
  } catch {
    return EMPTY_AGENT_CONNECTION;
  }
}
