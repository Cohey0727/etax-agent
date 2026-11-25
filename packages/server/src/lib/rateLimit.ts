/**
 * rateLimit.ts — 認証系エンドポイント向けの簡易レート制限（lib）。
 * プロセス内メモリの固定ウィンドウで数える（単一インスタンス運用前提）。
 * ログイン・マジックリンク発行・TOTP 試行などの総当たり/濫用を抑える。
 */
import { Context, MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * 1リクエスト分を記録し、制限を超えたら true を返す。
 * ウィンドウを過ぎたキーはその場でリセットする（掃除は次回アクセス時）。
 */
export function rateLimitExceeded(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/** 制限キーの元になるクライアントIP（プロキシ配備では X-Forwarded-For の先頭）。 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return "local";
}

/** 指定エンドポイントにレート制限をかけるミドルウェアを作る。 */
export function rateLimitMiddleware(
  name: string,
  limit: number,
  windowMs: number,
): MiddlewareHandler {
  return async (c, next) => {
    if (rateLimitExceeded(`${name}:${clientIp(c)}`, limit, windowMs)) {
      return c.json(
        { error: "リクエストが多すぎます。しばらく待ってから再試行してください" },
        429,
      );
    }
    await next();
  };
}
