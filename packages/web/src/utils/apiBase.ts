import { Capacitor } from "@capacitor/core";

/** ネイティブアプリが接続する本番 API のオリジン。 */
const NATIVE_DEFAULT_API_ORIGIN = "https://mini-etax.spaghetti-monster.com";

/**
 * API の接続先オリジン。
 * Web では同一オリジン配信が前提なので相対（空文字）。
 * ネイティブアプリではアセットがバンドル内配信になるため、接続先
 * サーバーのオリジンを絶対 URL で返す。VITE_API_BASE_URL で上書きできる。
 */
export function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === "string" && configured.trim() !== "") {
    return configured.trim().replace(/\/+$/, "");
  }
  return Capacitor.isNativePlatform() ? NATIVE_DEFAULT_API_ORIGIN : "";
}

export const API_BASE_URL = resolveApiBaseUrl();
