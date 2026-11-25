/**
 * ssrfGuard.ts — ユーザーが指定した接続先 URL の検証（lib）。
 *
 * 設定画面やリクエストで渡される baseUrl は、サーバーに任意の宛先へ
 * 接続させる SSRF の入口になりうる。サーバー環境変数で設定された
 * 接続先（運用者の選択）は対象外とし、ユーザー指定の URL だけを
 * ここで検証する:
 *   - スキームは http / https のみ、URL 内の資格情報は不可（常時）。
 *   - SaaS モード（ETAX_AUTH_MODE=required）では加えて、名前解決した
 *     アドレスがプライベート / ループバック / リンクローカル等の
 *     内部アドレスなら拒否する。ローカル運用では Ollama 等の
 *     ローカル接続先が正規の使い方のため、この追加検証は行わない。
 *
 * 既知の残存リスク: 検証時点と接続時点の DNS 再束縛（rebinding）は
 * この層では防げない。公開先がリダイレクトで内部へ飛ぶケースも同様。
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { authRequired } from "./tenantContext";

/** 接続先 URL が安全でないことを表す例外。 */
export class UnsafeUrlError extends Error {}

/** IPv4 アドレスが内部・予約レンジかどうか。 */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // 解釈できないものは安全側に倒す
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 127) return true; // ループバック
  if (a === 169 && b === 254) return true; // リンクローカル（クラウドのメタデータ含む）
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 240) return true; // 予約・ブロードキャスト
  return false;
}

/** IPv6 アドレスが内部・予約レンジかどうか。 */
export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  // IPv4 マップドアドレスは IPv4 として判定する
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  if (/^fe[89ab]/.test(lower)) return true; // リンクローカル fe80::/10
  if (/^f[cd]/.test(lower)) return true; // ユニークローカル fc00::/7
  return false;
}

/** IP リテラルが内部アドレスかどうか（IP でなければ false）。 */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return false;
}

/**
 * ユーザー指定の接続先 URL を検証する。安全でなければ UnsafeUrlError。
 * SaaS モードでは DNS 解決まで行い、解決先が内部アドレスなら拒否する。
 */
export async function assertSafeUserBaseUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`接続先 URL の形式が不正です: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("接続先 URL は http または https で指定してください");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("接続先 URL に資格情報を含めることはできません");
  }
  if (!authRequired()) return;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host.toLowerCase() === "localhost") {
    throw new UnsafeUrlError("内部アドレスへの接続先は指定できません");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new UnsafeUrlError("内部アドレスへの接続先は指定できません");
    }
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError(`接続先ホストを解決できませんでした: ${host}`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new UnsafeUrlError("内部アドレスへ解決される接続先は指定できません");
  }
}
