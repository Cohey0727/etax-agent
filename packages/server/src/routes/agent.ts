/**
 * agent.ts — 対話エージェントルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { runAgentChatHandler, runAgentChatRoute } from "../usecases/runAgentChat";

const app = new OpenAPIHono();
app.openapi(runAgentChatRoute, runAgentChatHandler);

export default app;
