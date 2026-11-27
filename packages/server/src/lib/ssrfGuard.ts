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
  if (a === 198 && (b === 18 || b === 19)) return true; // ベンチマーク用 198.18.0.0/15
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // マルチキャスト・予約・ブロードキャスト
  return false;
}

/**
 * IPv6 アドレスを 16bit × 8 個に展開する。解釈できなければ null。
 * 末尾のドット10進表記（::ffff:127.0.0.1 など）も 16bit × 2 個に直す。
 */
function expandIpv6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  const dotted = text.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const octets = dotted.slice(2).map((p) => Number(p));
    if (octets.some((n) => n > 255)) return null;
    const [o1, o2, o3, o4] = octets as [number, number, number, number];
    text = `${dotted[1]}${((o1 << 8) | o2).toString(16)}:${((o3 << 8) | o4).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** 16bit 2つに入った IPv4 アドレスをドット10進表記にする。 */
function embeddedIpv4(high: number, low: number): string {
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/**
 * IPv6 アドレスが内部・予約レンジかどうか。
 * IPv4 を埋め込む形式（IPv4 射影・IPv4 変換・NAT64・6to4）は、埋め込まれた
 * IPv4 で判定する。URL のホストは16進表記（::ffff:7f00:1）に正規化されて
 * 届くため、文字列の形ではなく展開した値で比べる。
 */
export function isPrivateIpv6(ip: string): boolean {
  const groups = expandIpv6(ip);
  if (!groups) return true; // 解釈できないものは安全側に倒す
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number, number, number, number, number, number, number, number,
  ];
  const leadingZeros = (count: number) => groups.slice(0, count).every((g) => g === 0);
  if (leadingZeros(7) && (g7 === 0 || g7 === 1)) return true; // :: と ::1
  if (leadingZeros(5) && g5 === 0xffff) return isPrivateIpv4(embeddedIpv4(g6, g7)); // ::ffff:0:0/96
  if (leadingZeros(4) && g4 === 0xffff && g5 === 0) return isPrivateIpv4(embeddedIpv4(g6, g7)); // ::ffff:0:0:0/96
  if (leadingZeros(6)) return true; // IPv4 互換 ::/96（廃止済み）
  if (g0 === 0x64 && g1 === 0xff9b) {
    // NAT64: 64:ff9b::/96 は埋め込みの IPv4 で、64:ff9b:1::/48 はローカル用途
    return g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0
      ? isPrivateIpv4(embeddedIpv4(g6, g7))
      : true;
  }
  if (g0 === 0x2002) return isPrivateIpv4(embeddedIpv4(g1, g2)); // 6to4 2002::/16
  if ((g0 & 0xffc0) === 0xfe80) return true; // リンクローカル fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // サイトローカル fec0::/10（廃止済み）
  if ((g0 & 0xfe00) === 0xfc00) return true; // ユニークローカル fc00::/7
  if ((g0 & 0xff00) === 0xff00) return true; // マルチキャスト ff00::/8
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
