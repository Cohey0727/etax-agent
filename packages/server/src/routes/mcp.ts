/**
 * mcp.ts — MCP エンドポイントのルート登録（routes）。
 * 登録のみを行い、処理は usecases/handleMcpRequest に委ねる。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { handleMcpRequest } from "../usecases/handleMcpRequest";

const app = new OpenAPIHono();
app.all("/mcp", handleMcpRequest);

export default app;
