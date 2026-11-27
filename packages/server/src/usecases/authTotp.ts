/**
 * authTotp.ts — TOTP 2要素認証の設定とログイン2段階目（usecases）。
 * 設定（setup → enable）はログイン済みセッションが前提。ログイン時は
 * パスワード確認後に短期チャレンジを返し、コード検証でセッションを発行する。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { beginChallengeUse, burnChallenge, verifyChallenge } from "../lib/loginChallenge";
import { enforceAccountRateLimit } from "../lib/rateLimit";
import { currentUserId } from "../lib/tenantContext";
import { generateTotpSecret, totpOtpauthUrl, verifyTotpCode } from "../lib/totp";
import { usersTable } from "../repositories/schema";
import {
  readUserTotpSecret,
  setUserTotpEnabled,
  setUserTotpSecret,
} from "../repositories/userRepository";
import {
  AuthSessionResponseSchema,
  LoginTotpRequestSchema,
  TotpCodeRequestSchema,
  TotpSetupResponseSchema,
} from "../schemas/auth";
import { issueSession } from "./authSession";

function requireDb(c: Context) {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  return db;
}

async function requireUser(c: Context) {
  const db = requireDb(c);
  const userId = currentUserId();
  if (userId === undefined) {
    throw new HTTPException(401, { message: "ログインが必要です" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new HTTPException(401, { message: "ログインが必要です" });
  return { db, user };
}

async function readCode(c: Context): Promise<string> {
  const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
  return typeof body?.code === "string" ? body.code : "";
}

export const totpSetupRoute = createRoute({
  method: "post",
  path: "/api/auth/totp/setup",
  responses: {
    200: {
      content: { "application/json": { schema: TotpSetupResponseSchema } },
      description: "TOTP 秘密を発行した（まだ有効化されていない）",
    },
  },
});

export const totpSetupHandler: RouteHandler<typeof totpSetupRoute> = async (c) => {
  const { db, user } = await requireUser(c);
  if (user.totpEnabled) {
    // 有効化済みの秘密の上書きは、現在のコード確認を必須にする。
    // セッションを奪われただけでは 2FA を差し替えられないようにするため。
    const currentSecret = readUserTotpSecret(user);
    const code = await readCode(c);
    if (!currentSecret || !verifyTotpCode(currentSecret, code)) {
      throw new HTTPException(400, {
        message: "TOTP を設定し直すには現在のコードが必要です",
      });
    }
  }
  const secret = generateTotpSecret();
  await setUserTotpSecret(db, user.id, secret);
  return c.json({ otpauth_url: totpOtpauthUrl(secret, user.email), secret });
};

export const totpEnableRoute = createRoute({
  method: "post",
  path: "/api/auth/totp/enable",
  request: {
    body: { content: { "application/json": { schema: TotpCodeRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuthSessionResponseSchema.partial() } },
      description: "TOTP を有効化した",
    },
  },
});

export const totpEnableHandler: RouteHandler<typeof totpEnableRoute> = async (c) => {
  const { db, user } = await requireUser(c);
  const secret = readUserTotpSecret(user);
  if (!secret) {
    throw new HTTPException(400, { message: "先に TOTP の設定を開始してください" });
  }
  const code = await readCode(c);
  if (!verifyTotpCode(secret, code)) {
    throw new HTTPException(400, { message: "コードが違います" });
  }
  await setUserTotpEnabled(db, user.id, true);
  return c.json({ user: { id: user.id, email: user.email, totp_enabled: true } });
};

export const totpDisableRoute = createRoute({
  method: "post",
  path: "/api/auth/totp/disable",
  request: {
    body: { content: { "application/json": { schema: TotpCodeRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuthSessionResponseSchema.partial() } },
      description: "TOTP を無効化した",
    },
  },
});

export const totpDisableHandler: RouteHandler<typeof totpDisableRoute> = async (c) => {
  const { db, user } = await requireUser(c);
  const secret = readUserTotpSecret(user);
  const code = await readCode(c);
  if (!secret || !verifyTotpCode(secret, code)) {
    throw new HTTPException(400, { message: "コードが違います" });
  }
  await setUserTotpEnabled(db, user.id, false);
  return c.json({ user: { id: user.id, email: user.email, totp_enabled: false } });
};

/** 同じユーザーへの TOTP 試行の上限。 */
const ACCOUNT_TOTP_LIMIT = 10;
const ACCOUNT_TOTP_WINDOW_MS = 5 * 60 * 1000;

export const loginTotpRoute = createRoute({
  method: "post",
  path: "/api/auth/login/totp",
  request: {
    body: { content: { "application/json": { schema: LoginTotpRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuthSessionResponseSchema } },
      description: "TOTP 検証が済み、セッションを発行した",
    },
  },
});

export const loginTotpHandler: RouteHandler<typeof loginTotpRoute> = async (c) => {
  const db = requireDb(c);
  const body = (await c.req.json().catch(() => null)) as
    | { challenge?: unknown; code?: unknown }
    | null;
  const challenge = typeof body?.challenge === "string" ? body.challenge : "";
  const code = typeof body?.code === "string" ? body.code : "";
  // チャレンジを取り直しながらの総当たりを止めるため、ユーザー単位でも数える
  const challengedUserId = verifyChallenge(challenge, "totp-login");
  if (challengedUserId !== undefined) {
    enforceAccountRateLimit(
      `login-totp-account:${challengedUserId}`,
      ACCOUNT_TOTP_LIMIT,
      ACCOUNT_TOTP_WINDOW_MS,
    );
  }
  // チャレンジは試行回数を数え（上限で失効）、成功時は消費して再利用を防ぐ
  const userId = beginChallengeUse(challenge, "totp-login");
  if (userId === undefined) {
    throw new HTTPException(401, { message: "チャレンジが無効か期限切れです。ログインし直してください" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const secret = user ? readUserTotpSecret(user) : null;
  if (!user || !secret || !verifyTotpCode(secret, code)) {
    throw new HTTPException(401, { message: "コードが違います" });
  }
  burnChallenge(challenge, "totp-login");
  const token = await issueSession(c, db, user.id);
  return c.json({
    user: { id: user.id, email: user.email, totp_enabled: user.totpEnabled },
    token,
  });
};
