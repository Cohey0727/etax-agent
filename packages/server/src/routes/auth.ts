/**
 * auth.ts — 認証まわりのルート登録（routes）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
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

const app = new OpenAPIHono();
app.openapi(registerRoute, registerHandler);
app.openapi(loginRoute, loginHandler);
app.openapi(logoutRoute, logoutHandler);
app.openapi(meRoute, meHandler);
app.openapi(createApiKeyRoute, createApiKeyHandler);
app.openapi(listApiKeysRoute, listApiKeysHandler);
app.openapi(deleteApiKeyRoute, deleteApiKeyHandler);

export default app;
