/**
 * loginChallenge.ts — ログインの2段階目（TOTP）へ渡す短期チャレンジ（lib）。
 * 署名つきトークン（ユーザーID＋期限＋用途＋一意な jti）。
 * 署名鍵は ETAX_AUTH_SECRET → ETAX_ENCRYPTION_KEY の順に環境変数から取り、
 * どちらも無ければプロセス内ランダム（再起動で失効する）にする。
 *
 * 再利用対策: 署名だけでは TTL 内に何度でも使えてしまうため、jti 単位で
 * 「使用回数」と「消費済み」をプロセス内メモリで数える（jti の無いトークンは
 * 数えられないので受け付けない）。TOTP 試行は5回まででチャレンジを失効させ、
 * 成功時は即座に消費済みにして再利用を防ぐ。OAuth state も同じ仕組みで
 * 単回使用にする。状態はプロセス内のみ（単一インスタンス運用前提。
 * 再起動で失効するのも安全側）。
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
    JSON.stringify({
      uid: userId,
      purpose,
      exp: Date.now() + ttlMs,
      jti: randomBytes(16).toString("base64url"),
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

interface ChallengePayload {
  uid: number;
  purpose: string;
  exp: number;
  jti: string;
}

/** 署名・期限・用途を検証してペイロードを返す（使用回数は数えない）。 */
function parseChallenge(token: string, purpose: string): ChallengePayload | undefined {
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
      jti?: unknown;
    };
    if (parsed.purpose !== purpose) return undefined;
    if (typeof parsed.exp !== "number" || parsed.exp < Date.now()) return undefined;
    if (typeof parsed.uid !== "number" || !Number.isInteger(parsed.uid)) return undefined;
    if (typeof parsed.jti !== "string" || parsed.jti === "") return undefined;
    return { uid: parsed.uid, purpose, exp: parsed.exp, jti: parsed.jti };
  } catch {
    return undefined;
  }
}

/** チャレンジを検証し、ユーザーIDを返す。不正・期限切れ・用途違いは undefined。 */
export function verifyChallenge(token: string, purpose: string): number | undefined {
  return parseChallenge(token, purpose)?.uid;
}

/** 1つのチャレンジで許可する試行回数（TOTP の総当たりを防ぐ）。 */
export const MAX_CHALLENGE_ATTEMPTS = 5;

interface ChallengeUse {
  attempts: number;
  consumed: boolean;
  exp: number;
}

const challengeUses = new Map<string, ChallengeUse>();

function pruneChallengeUses(now: number): void {
  for (const [jti, use] of challengeUses) {
    if (use.exp < now) challengeUses.delete(jti);
  }
}

/**
 * チャレンジの使用を1回分記録し、ユーザーIDを返す。
 * 消費済み・試行上限到達・不正・期限切れは undefined（上限到達時は失効させる）。
 */
export function beginChallengeUse(token: string, purpose: string): number | undefined {
  const parsed = parseChallenge(token, purpose);
  if (!parsed) return undefined;
  const now = Date.now();
  pruneChallengeUses(now);
  const use = challengeUses.get(parsed.jti) ?? { attempts: 0, consumed: false, exp: parsed.exp };
  if (use.consumed || use.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    challengeUses.set(parsed.jti, { ...use, consumed: true });
    return undefined;
  }
  use.attempts += 1;
  challengeUses.set(parsed.jti, use);
  return parsed.uid;
}

/** チャレンジを消費済みにする（成功直後に呼ぶ。再利用を防ぐ）。 */
export function burnChallenge(token: string, purpose: string): void {
  const parsed = parseChallenge(token, purpose);
  if (!parsed) return;
  const use = challengeUses.get(parsed.jti) ?? { attempts: 0, consumed: false, exp: parsed.exp };
  challengeUses.set(parsed.jti, { ...use, consumed: true });
}
