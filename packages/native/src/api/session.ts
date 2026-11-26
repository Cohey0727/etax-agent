/**
 * session.ts — セッショントークンの保持。実値は端末の安全な保存領域
 * （expo-secure-store）に置き、API 呼び出し用にメモリにも写しを持つ。
 * サーバーはセッショントークンを Authorization: Bearer でも受けるため、
 * Cookie を使わずにこのトークンで認証する。
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "etax.session.token";

let cachedToken: string | null = null;
let loaded = false;
const listeners = new Set<(token: string | null) => void>();

function notify(): void {
  for (const listener of listeners) listener(cachedToken);
}

/** 起動時に保存済みトークンを読み込む。 */
export async function loadSessionToken(): Promise<string | null> {
  if (loaded) return cachedToken;
  loaded = true;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

/** 現在のトークン（同期）。未読込・未ログインは null。 */
export function currentSessionToken(): string | null {
  return cachedToken;
}

/** ログイン成功時にトークンを保存する。 */
export async function saveSessionToken(token: string): Promise<void> {
  cachedToken = token;
  loaded = true;
  notify();
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch {
    // 保存できなくても、この起動の間はメモリ上のトークンで動作する
  }
}

/** ログアウト時にトークンを消す。 */
export async function clearSessionToken(): Promise<void> {
  cachedToken = null;
  notify();
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // 消せなくてもメモリ上は破棄済み
  }
}

/** トークンの変化を購読する（認証ガード用）。解除関数を返す。 */
export function subscribeSessionToken(
  listener: (token: string | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
