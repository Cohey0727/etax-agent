/**
 * cashFlow.ts — 資金繰りレポートのルート登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { validationHook } from "../lib/validationHook";
import {
  getCashFlowReportHandler,
  getCashFlowReportRoute,
  getCashFlowReportValidationMessage,
} from "../usecases/getCashFlowReport";

const app = new OpenAPIHono();
app.openapi(
  getCashFlowReportRoute,
  getCashFlowReportHandler,
  validationHook(getCashFlowReportValidationMessage),
);

export default app;
