/**
 * authAccount.ts — ユーザー登録・ログイン・ログアウト・自分の情報（usecases）。
 * セッショントークンはレスポンス JSON と httpOnly Cookie の両方で返す。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { currentUserId } from "../lib/tenantContext";
import { usersTable } from "../repositories/schema";
import {
  createSession,
  createUser,
  deleteSession,
  getUserByEmail,
  verifyUserPassword,
} from "../repositories/userRepository";
import {
  AuthSessionResponseSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
} from "../schemas/auth";
import { SESSION_COOKIE, requestSessionToken } from "./authSession";

function requireDb(c: Context) {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  return db;
}

function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
}

export const registerRoute = createRoute({
  method: "post",
  path: "/api/auth/register",
  request: {
    body: { content: { "application/json": { schema: RegisterRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuthSessionResponseSchema } },
      description: "登録し、セッションを発行した",
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
  const user = await createUser(db, email, password);
  const token = await createSession(db, user.id);
  setSessionCookie(c, token);
  return c.json({ user: { id: user.id, email: user.email }, token });
};

export const loginRoute = createRoute({
  method: "post",
  path: "/api/auth/login",
  request: {
    body: { content: { "application/json": { schema: LoginRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuthSessionResponseSchema } },
      description: "ログインし、セッションを発行した",
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
  const token = await createSession(db, user.id);
  setSessionCookie(c, token);
  return c.json({ user: { id: user.id, email: user.email }, token });
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
  return c.json({ user: { id: user.id, email: user.email } });
};
