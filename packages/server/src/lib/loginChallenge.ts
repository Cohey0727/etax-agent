/**
 * loginChallenge.ts — ログインの2段階目（TOTP）へ渡す短期チャレンジ（lib）。
 * 署名つきトークン（ユーザーID＋期限＋用途）で、サーバー側に状態を持たない。
 * 署名鍵は ETAX_AUTH_SECRET → ETAX_ENCRYPTION_KEY の順に環境変数から取り、
 * どちらも無ければプロセス内ランダム（再起動で失効する）にする。
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

let fallbackSecret: string | null = null;

function signingSecret(): string {
  const fromEnv = process.env.ETAX_AUTH_SECRET || process.env.ETAX_ENCRYPTION_KEY;
  if (fromEnv) return fromEnv;
  if (!fallbackSecret) fallbackSecret = randomBytes(32).toString("hex");
  return fallbackSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/** チャレンジを発行する（既定5分有効）。 */
export function issueChallenge(userId: number, purpose: string, ttlMs: number = 5 * 60 * 1000): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, purpose, exp: Date.now() + ttlMs }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** チャレンジを検証し、ユーザーIDを返す。不正・期限切れ・用途違いは undefined。 */
export function verifyChallenge(token: string, purpose: string): number | undefined {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return undefined;
  const expected = sign(payload);
  if (
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      uid?: unknown;
      purpose?: unknown;
      exp?: unknown;
    };
    if (parsed.purpose !== purpose) return undefined;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return undefined;
    if (typeof parsed.uid !== "number" || !Number.isInteger(parsed.uid)) return undefined;
    return parsed.uid;
  } catch {
    return undefined;
  }
}
