/**
 * publicUrl.ts — 公開オリジン（ETAX_PUBLIC_URL）の解決（lib）。
 * メール内リンクや OAuth の redirect_uri は、Host / Origin ヘッダで
 * 組み立てるとヘッダ汚染で攻撃者のドメインへ誘導できてしまうため、
 * 設定済みの公開オリジンだけを使う（Issue #6 Origin 汚染対策）。
 */
import { Context } from "hono";

/** 設定済みの公開オリジン（末尾スラッシュなし）。未設定なら null。 */
export function publicBaseUrl(): string | null {
  const url = process.env.ETAX_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return url ? url : null;
}

/**
 * https 前提の配備かどうか。公開オリジンが https、またはこのリクエスト
 * 自体が https で届いている場合に true（Cookie の Secure 判定に使う）。
 */
export function isSecureDeployment(c: Context): boolean {
  if ((process.env.ETAX_PUBLIC_URL ?? "").startsWith("https://")) return true;
  return c.req.url.startsWith("https://");
}
