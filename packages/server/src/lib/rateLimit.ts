/**
 * rateLimit.ts — 認証系エンドポイント向けの簡易レート制限（lib）。
 * プロセス内メモリの固定ウィンドウで数える（単一インスタンス運用前提）。
 * ログイン・マジックリンク発行・TOTP 試行などの総当たり/濫用を抑える。
 * 接続元 IP 単位の制限（ミドルウェア）と、メールアドレス・ユーザー ID 単位の
 * 制限（ハンドラから呼ぶ）を併用し、IP を変えても同じ利用者への試行は止める。
 */
import { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** 期限切れバケットを掃除する間隔（ミリ秒）。 */
const SWEEP_INTERVAL_MS = 60_000;
let nextSweepAt = 0;

/** 制限を超えたときの文言。 */
export const RATE_LIMITED_MESSAGE =
  "リクエストが多すぎます。しばらく待ってから再試行してください";

/** ウィンドウを過ぎたバケットを消し、消した件数を返す。 */
export function pruneExpiredRateLimitBuckets(now: number): number {
  let removed = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
      removed += 1;
    }
  }
  return removed;
}

/**
 * 1リクエスト分を記録し、制限を超えたら true を返す。
 * ウィンドウを過ぎたキーはその場でリセットし、一度しか来ないキーで
 * メモリが増え続けないよう、期限切れのバケットを定期的にまとめて消す。
 */
export function rateLimitExceeded(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  if (now >= nextSweepAt) {
    pruneExpiredRateLimitBuckets(now);
    nextSweepAt = now + SWEEP_INTERVAL_MS;
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/** Bun のサーバー（fetch の第2引数）が持つ接続元の取得口。 */
interface RequestIpSource {
  requestIP(request: Request): { address: string } | null;
}

function isRequestIpSource(value: unknown): value is RequestIpSource {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { requestIP?: unknown }).requestIP === "function"
  );
}

/**
 * 制限キーの元になるクライアント IP。CF-Connecting-IP があればそれを、
 * 無ければソケットの接続元を使う。CF-Connecting-IP は Cloudflare が
 * 付け直すため、Cloudflare を経由する配備では利用者が偽装できない
 * （経由しない配備では偽装できるため、利用者単位の制限を併用する）。
 * X-Forwarded-For は先頭を利用者が自由に書けるため使わない。
 * どちらも取れなければ "unknown"。
 */
export function clientIp(c: Context): string {
  const cloudflare = c.req.header("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const server: unknown = c.env;
  if (isRequestIpSource(server)) {
    const address = server.requestIP(c.req.raw)?.address;
    if (address) return address;
  }
  return "unknown";
}

/** 指定エンドポイントに接続元 IP 単位のレート制限をかけるミドルウェアを作る。 */
export function rateLimitMiddleware(
  name: string,
  limit: number,
  windowMs: number,
): MiddlewareHandler {
  return async (c, next) => {
    if (rateLimitExceeded(`${name}:${clientIp(c)}`, limit, windowMs)) {
      return c.json({ error: RATE_LIMITED_MESSAGE }, 429);
    }
    await next();
  };
}

/** 利用者（メールアドレス・ユーザー ID）単位の制限。超えたら 429 を投げる。 */
export function enforceAccountRateLimit(key: string, limit: number, windowMs: number): void {
  if (rateLimitExceeded(key, limit, windowMs)) {
    throw new HTTPException(429, { message: RATE_LIMITED_MESSAGE });
  }
}
