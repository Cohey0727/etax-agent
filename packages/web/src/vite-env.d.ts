/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API の接続先オリジン（例: https://example.com）。未指定時は同一オリジン（ネイティブでは本番）。 */
  readonly VITE_API_BASE_URL?: string;
}
