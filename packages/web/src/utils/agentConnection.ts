/**
 * agentConnection.ts — エージェント接続設定（baseUrl / model / apiKey）の
 * 端末保存（utils）。
 *
 * APIキーは平文のまま localStorage に置かない（Issue #9）: 永続保存するのは
 * baseUrl と model だけで、キーは sessionStorage（タブを閉じると消える）に
 * 保持する。従来 localStorage に入っていたキーは読み込み時に移行して消す。
 */
import { AgentConnectionConfig } from "@types";

const CONNECTION_STORAGE_KEY = "etax-agent-connection";
const CONNECTION_KEY_STORAGE_KEY = "etax-agent-connection-key";

/** 保存済みの接続設定を読む（キーはセッション保存から）。 */
export const loadAgentConnection = (): AgentConnectionConfig => {
  let baseUrl = "";
  let model = "";
  let apiKey = "";
  try {
    const raw = localStorage.getItem(CONNECTION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AgentConnectionConfig>;
      baseUrl = typeof parsed.baseUrl === "string" ? parsed.baseUrl : "";
      model = typeof parsed.model === "string" ? parsed.model : "";
      // 旧形式（キーも localStorage）からの移行: 読んだら消す
      if (typeof parsed.apiKey === "string" && parsed.apiKey !== "") {
        apiKey = parsed.apiKey;
        saveAgentConnection({ baseUrl, model, apiKey });
      }
    }
  } catch {
    // 読めない環境では未設定として扱う
  }
  if (!apiKey) {
    try {
      apiKey = sessionStorage.getItem(CONNECTION_KEY_STORAGE_KEY) ?? "";
    } catch {
      apiKey = "";
    }
  }
  return { baseUrl, model, apiKey };
};

/** 接続設定を保存する（キーはセッション保存のみ）。 */
export const saveAgentConnection = (config: AgentConnectionConfig): void => {
  try {
    localStorage.setItem(
      CONNECTION_STORAGE_KEY,
      JSON.stringify({ baseUrl: config.baseUrl, model: config.model }),
    );
  } catch {
    // 保存できなくてもこのセッションでは有効にする
  }
  try {
    if (config.apiKey) sessionStorage.setItem(CONNECTION_KEY_STORAGE_KEY, config.apiKey);
    else sessionStorage.removeItem(CONNECTION_KEY_STORAGE_KEY);
  } catch {
    // 同上
  }
};

/** セッション保存の APIキーを消す（ログアウト時）。 */
export const clearStoredAgentApiKey = (): void => {
  try {
    sessionStorage.removeItem(CONNECTION_KEY_STORAGE_KEY);
  } catch {
    // 消せない環境ではそのまま
  }
};
