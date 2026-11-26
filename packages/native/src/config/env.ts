/** API の接続先オリジン。EXPO_PUBLIC_API_URL で差し替えでき、既定は本番。 */
const DEFAULT_API_URL = "https://mini-etax.spaghetti-monster.com";

export function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (typeof configured === "string" && configured.trim() !== "") {
    return configured.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API_URL;
}

export const API_URL = resolveApiUrl();
