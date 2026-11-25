/**
 * cashFlow.ts — 資金繰りレポートのルート登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { getCashFlowReportHandler, getCashFlowReportRoute } from "../usecases/getCashFlowReport";

const app = new OpenAPIHono();
app.openapi(getCashFlowReportRoute, getCashFlowReportHandler);

export default app;
