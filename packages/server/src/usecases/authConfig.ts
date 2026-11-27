/**
 * authConfig.ts — 認証の公開設定（usecases）。
 * 画面が「ログイン必須か」「どのログイン方法を出すか」を判断するために使う。
 * OAuth はクライアントID/シークレットが環境変数に揃ったプロバイダだけ有効。
 * マジックリンクはメール送信（Resend）が設定されている場合のみ有効とする
 * （未設定でもリクエスト自体は受け付けるが、画面には出さない）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { authRequired } from "../lib/tenantContext";
import { AuthConfigResponseSchema } from "../schemas/auth";
import { mailConfigured } from "../gateways/mailGateway";
import { oauthConfigured } from "./authOAuth";

export const authConfigRoute = createRoute({
  method: "get",
  path: "/api/auth/config",
  responses: {
    200: {
      content: { "application/json": { schema: AuthConfigResponseSchema } },
      description: "認証の公開設定",
    },
  },
});

export const authConfigHandler: RouteHandler<typeof authConfigRoute> = (c) => {
  return c.json({
    required: authRequired(),
    methods: {
      password: true,
      magic_link: mailConfigured(),
      totp: true,
      // Passkey（WebAuthn）は未実装のため常に false
      passkey: false,
      google: oauthConfigured("google"),
      github: oauthConfigured("github"),
    },
  });
};
