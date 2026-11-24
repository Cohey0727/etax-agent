/**
 * authMagicLink.ts — メールリンクによるログイン（usecases）。
 * リクエストでは登録の有無を明かさず常に同じ応答を返す。リンクの有効期限は
 * 15分・1回限り。未登録のメールアドレスなら、消費時にパスワードなしの
 * ユーザーを作る（パスワードレス登録）。送信は Resend（services/email）。
 * リンクの宛先は設定済みの公開オリジン（ETAX_PUBLIC_URL）だけで組み立てる。
 * Host / Origin ヘッダは汚染され得るため使わない（Issue #6）。未設定なら
 * 安全なリンクを作れないので送信自体をしない。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../lib/db";
import { publicBaseUrl } from "../lib/publicUrl";
import { issueChallenge } from "../lib/loginChallenge";
import {
  clearUserPassword,
  consumeMagicLinkToken,
  createMagicLinkToken,
  createPasswordlessUser,
  getUserByEmail,
  markEmailVerified,
} from "../repositories/userRepository";
import {
  AuthSessionResponseSchema,
  MagicLinkConsumeRequestSchema,
  MagicLinkRequestSchema,
  TotpChallengeResponseSchema,
} from "../schemas/auth";
import { sendMail } from "../services/email/mailer";
import { issueSession } from "./authSession";

function requireDb(c: Context) {
  const db = getDb();
  if (!db) throw new HTTPException(503, { message: "データベースが設定されていません" });
  return db;
}

export const magicLinkRequestRoute = createRoute({
  method: "post",
  path: "/api/auth/magic-link",
  request: {
    body: { content: { "application/json": { schema: MagicLinkRequestSchema } }, required: true },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AuthSessionResponseSchema.partial() } },
      description: "リンクを送信した（登録の有無は明かさない）",
    },
  },
});

export const magicLinkRequestHandler: RouteHandler<typeof magicLinkRequestRoute> = async (c) => {
  const db = requireDb(c);
  const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const base = publicBaseUrl();
  if (email.includes("@") && base) {
    const token = await createMagicLinkToken(db, email);
    const link = `${base}/?magic=${encodeURIComponent(token)}`;
    await sendMail({
      to: email,
      subject: "eTaxAgent ログインリンク",
      text: `eTaxAgent へのログインリンクです（15分間有効・1回限り）。\n\n${link}\n\n心当たりがない場合は、このメールを無視してください。`,
    });
  }
  return c.json({});
};

export const magicLinkConsumeRoute = createRoute({
  method: "post",
  path: "/api/auth/magic-link/consume",
  request: {
    body: {
      content: { "application/json": { schema: MagicLinkConsumeRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: AuthSessionResponseSchema.or(TotpChallengeResponseSchema),
        },
      },
      description: "リンクを消費した（TOTP 有効時はチャレンジを返す）",
    },
  },
});

export const magicLinkConsumeHandler: RouteHandler<typeof magicLinkConsumeRoute> = async (c) => {
  const db = requireDb(c);
  const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const email = token ? await consumeMagicLinkToken(db, token) : undefined;
  if (!email) {
    throw new HTTPException(401, { message: "リンクが無効か期限切れです" });
  }
  const existing = await getUserByEmail(db, email);
  if (existing && !existing.emailVerified && existing.passwordHash) {
    // リンクを開けた = メールボックス所有者。未確認のパスワード登録が
    // 先行していた場合は資格情報を引き継がない（OAuth 統合と同じ扱い）。
    await clearUserPassword(db, existing.id);
    await markEmailVerified(db, existing.id);
    existing.passwordHash = "";
    existing.emailVerified = true;
  }
  const user = existing ?? (await createPasswordlessUser(db, email));
  // TOTP 有効なユーザーはパスワード経路と同じく2段階目を必須にする
  // （マジックリンクだけで 2FA を迂回させない、Issue #6）。
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
