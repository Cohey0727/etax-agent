/**
 * authAccount.ts — ユーザー登録・ログイン・ログアウト・自分の情報（usecases）。
 * セッショントークンはレスポンス JSON と httpOnly Cookie の両方で返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { Context } from "hono";
import { deleteCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { issueChallenge } from "../lib/loginChallenge";
import { publicBaseUrl } from "../lib/publicUrl";
import { authRequired, currentUserId } from "../lib/tenantContext";
import { usersTable } from "../repositories/schema";
import {
  createEmailVerificationToken,
  createUser,
  deleteSession,
  getUserByEmail,
  verifyUserPassword,
} from "../repositories/userRepository";
import {
  AuthSessionResponseSchema,
  EmailVerificationPendingResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  TotpChallengeResponseSchema,
} from "../schemas/auth";
import { sendMail } from "../services/email/mailer";
import { SESSION_COOKIE, issueSession, requestSessionToken } from "./authSession";

function requireDb(c: Context) {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  return db;
}

export const registerRoute = createRoute({
  method: "post",
  path: "/api/auth/register",
  request: {
    body: { content: { "application/json": { schema: RegisterRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthSessionResponseSchema.or(EmailVerificationPendingResponseSchema),
        },
      },
      description: "登録した（SaaS 運用ではメール確認待ちを返す）",
    },
  },
});

export const registerHandler: RouteHandler<typeof registerRoute> = async (c) => {
  const db = requireDb(c);
  const body = (await c.req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email.includes("@") || password.length < 8) {
    throw new HTTPException(400, {
      message: "メールアドレスと8文字以上のパスワードを指定してください",
    });
  }
  if (await getUserByEmail(db, email)) {
    throw new HTTPException(409, { message: "このメールアドレスは登録済みです" });
  }
  if (authRequired()) {
    // SaaS 運用: パスワード登録だけではメール所有を証明できないため、
    // 確認メールのリンクを経るまで未確認として作り、セッションは発行しない
    // （Pre-Account Takeover 対策、Issue #6）。確認は authVerifyEmail が担う。
    const base = publicBaseUrl();
    if (!base) {
      throw new HTTPException(503, {
        message: "公開オリジン（ETAX_PUBLIC_URL）が設定されていないため登録できません",
      });
    }
    const user = await createUser(db, email, password, false);
    const token = await createEmailVerificationToken(db, user.id);
    const link = `${base}/?verify=${encodeURIComponent(token)}`;
    await sendMail({
      to: email,
      subject: "eTaxAgent メールアドレス確認",
      text: `eTaxAgent への登録ありがとうございます。以下のリンクを開いてメールアドレスを確認してください（24時間有効・1回限り）。\n\n${link}\n\n心当たりがない場合は、このメールを無視してください。`,
    });
    return c.json({ verification_required: true as const });
  }
  const user = await createUser(db, email, password);
  const token = await issueSession(c, db, user.id);
  return c.json({ user: { id: user.id, email: user.email, totp_enabled: false }, token });
};

export const loginRoute = createRoute({
  method: "post",
  path: "/api/auth/login",
  request: {
    body: { content: { "application/json": { schema: LoginRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthSessionResponseSchema.or(TotpChallengeResponseSchema),
        },
      },
      description: "ログインした（TOTP 有効時はチャレンジを返す）",
    },
  },
});

export const loginHandler: RouteHandler<typeof loginRoute> = async (c) => {
  const db = requireDb(c);
  const body = (await c.req.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const user = email ? await getUserByEmail(db, email) : undefined;
  if (!user || !(await verifyUserPassword(user, password))) {
    throw new HTTPException(401, { message: "メールアドレスまたはパスワードが違います" });
  }
  // SaaS 運用では、メール確認が済んでいないパスワードアカウントに
  // ログインさせない（未確認の先行登録を有効化させない）。
  if (authRequired() && user.passwordHash && !user.emailVerified) {
    throw new HTTPException(403, {
      message:
        "メールアドレスの確認が完了していません。登録時に送った確認メールのリンクを開いてください",
    });
  }
  // TOTP が有効なユーザーは、コード検証が済むまでセッションを発行しない
  if (user.totpEnabled) {
    return c.json({
      totp_required: true as const,
      challenge: issueChallenge(user.id, "totp-login"),
    });
  }
  const token = await issueSession(c, db, user.id);
  return c.json({
    user: { id: user.id, email: user.email, totp_enabled: user.totpEnabled },
    token,
  });
};

export const logoutRoute = createRoute({
  method: "post",
  path: "/api/auth/logout",
  responses: {
    200: {
      content: { "application/json": { schema: AuthSessionResponseSchema.partial() } },
      description: "セッションを破棄した",
    },
  },
});

export const logoutHandler: RouteHandler<typeof logoutRoute> = async (c) => {
  const db = requireDb(c);
  const token = requestSessionToken(c);
  if (token) await deleteSession(db, token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({});
};

export const meRoute = createRoute({
  method: "get",
  path: "/api/auth/me",
  responses: {
    200: {
      content: { "application/json": { schema: AuthSessionResponseSchema.partial() } },
      description: "現在のユーザー",
    },
  },
});

export const meHandler: RouteHandler<typeof meRoute> = async (c) => {
  const db = requireDb(c);
  const userId = currentUserId();
  if (userId === undefined) {
    throw new HTTPException(401, { message: "ログインしていません" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new HTTPException(401, { message: "ログインしていません" });
  return c.json({
    user: { id: user.id, email: user.email, totp_enabled: user.totpEnabled },
  });
};
