/**
 * authVerifyEmail.ts — 登録時のメールアドレス確認（usecases）。
 * 確認メールのリンク（?verify=<token>）を画面が消費しに来る。トークンは
 * 24時間有効・1回限り。確認できたら確認済みに更新してセッションを発行する
 * （TOTP 有効な既存ユーザーが再確認する場合はチャレンジを返す）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { issueChallenge } from "../lib/loginChallenge";
import { usersTable } from "../repositories/schema";
import {
  consumeEmailVerificationToken,
  markEmailVerified,
} from "../repositories/userRepository";
import {
  AuthSessionResponseSchema,
  TotpChallengeResponseSchema,
  VerifyEmailRequestSchema,
} from "../schemas/auth";
import { issueSession } from "./authSession";

function requireDb(c: Context) {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  return db;
}

export const verifyEmailRoute = createRoute({
  method: "post",
  path: "/api/auth/verify-email",
  request: {
    body: { content: { "application/json": { schema: VerifyEmailRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthSessionResponseSchema.or(TotpChallengeResponseSchema),
        },
      },
      description: "メール確認が完了し、セッションを発行した",
    },
  },
});

export const verifyEmailHandler: RouteHandler<typeof verifyEmailRoute> = async (c) => {
  const db = requireDb(c);
  const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const userId = token ? await consumeEmailVerificationToken(db, token) : undefined;
  if (userId === undefined) {
    throw new HTTPException(401, { message: "確認リンクが無効か期限切れです" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    throw new HTTPException(401, { message: "確認リンクが無効か期限切れです" });
  }
  await markEmailVerified(db, user.id);
  if (user.totpEnabled) {
    return c.json({
      totp_required: true as const,
      challenge: issueChallenge(user.id, "totp-login"),
    });
  }
  const sessionToken = await issueSession(c, db, user.id);
  return c.json({
    user: { id: user.id, email: user.email, totp_enabled: user.totpEnabled },
    token: sessionToken,
  });
};
