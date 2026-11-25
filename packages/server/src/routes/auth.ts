/**
 * auth.ts — 認証まわりのルート登録（routes）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { rateLimitMiddleware } from "../lib/rateLimit";
import {
  loginHandler,
  loginRoute,
  logoutHandler,
  logoutRoute,
  meHandler,
  meRoute,
  registerHandler,
  registerRoute,
} from "../usecases/authAccount";
import {
  createApiKeyHandler,
  createApiKeyRoute,
  deleteApiKeyHandler,
  deleteApiKeyRoute,
  listApiKeysHandler,
  listApiKeysRoute,
} from "../usecases/authApiKeys";
import { authConfigHandler, authConfigRoute } from "../usecases/authConfig";
import {
  magicLinkConsumeHandler,
  magicLinkConsumeRoute,
  magicLinkRequestHandler,
  magicLinkRequestRoute,
} from "../usecases/authMagicLink";
import { oauthCallbackHandler, oauthStartHandler } from "../usecases/authOAuth";
import { verifyEmailHandler, verifyEmailRoute } from "../usecases/authVerifyEmail";
import {
  loginTotpHandler,
  loginTotpRoute,
  totpDisableHandler,
  totpDisableRoute,
  totpEnableHandler,
  totpEnableRoute,
  totpSetupHandler,
  totpSetupRoute,
} from "../usecases/authTotp";

const app = new OpenAPIHono();
// 認証系の総当たり・濫用対策（Issue #6）。IP 単位の固定ウィンドウ制限。
app.use("/api/auth/login", rateLimitMiddleware("login", 30, 5 * 60 * 1000));
app.use("/api/auth/login/totp", rateLimitMiddleware("login-totp", 30, 5 * 60 * 1000));
app.use("/api/auth/register", rateLimitMiddleware("register", 20, 60 * 60 * 1000));
app.use("/api/auth/magic-link", rateLimitMiddleware("magic-link", 10, 10 * 60 * 1000));
app.use("/api/auth/magic-link/consume", rateLimitMiddleware("magic-consume", 30, 5 * 60 * 1000));
app.use("/api/auth/verify-email", rateLimitMiddleware("verify-email", 30, 5 * 60 * 1000));
app.use("/api/auth/totp/*", rateLimitMiddleware("totp", 30, 5 * 60 * 1000));
app.openapi(registerRoute, registerHandler);
app.openapi(loginRoute, loginHandler);
app.openapi(logoutRoute, logoutHandler);
app.openapi(meRoute, meHandler);
app.openapi(authConfigRoute, authConfigHandler);
app.openapi(loginTotpRoute, loginTotpHandler);
app.openapi(totpSetupRoute, totpSetupHandler);
app.openapi(totpEnableRoute, totpEnableHandler);
app.openapi(totpDisableRoute, totpDisableHandler);
app.openapi(magicLinkRequestRoute, magicLinkRequestHandler);
app.openapi(magicLinkConsumeRoute, magicLinkConsumeHandler);
app.openapi(verifyEmailRoute, verifyEmailHandler);
app.get("/api/auth/oauth/:provider/start", oauthStartHandler);
app.get("/api/auth/oauth/:provider/callback", oauthCallbackHandler);
app.openapi(createApiKeyRoute, createApiKeyHandler);
app.openapi(listApiKeysRoute, listApiKeysHandler);
app.openapi(deleteApiKeyRoute, deleteApiKeyHandler);

export default app;
