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
import { verifyChallenge } from "../lib/loginChallenge";
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
  const userId = verifyChallenge(challenge, "totp-login");
  if (userId === undefined) {
    throw new HTTPException(401, { message: "チャレンジが無効か期限切れです。ログインし直してください" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const secret = user ? readUserTotpSecret(user) : null;
  if (!user || !secret || !verifyTotpCode(secret, code)) {
    throw new HTTPException(401, { message: "コードが違います" });
  }
  const token = await issueSession(c, db, user.id);
  return c.json({
    user: { id: user.id, email: user.email, totp_enabled: user.totpEnabled },
    token,
  });
};
