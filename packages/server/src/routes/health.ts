/**
 * health.ts — 疎通確認ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { getHealthHandler, getHealthRoute } from "../usecases/getHealth";

const app = new OpenAPIHono();
app.openapi(getHealthRoute, getHealthHandler);

export default app;
