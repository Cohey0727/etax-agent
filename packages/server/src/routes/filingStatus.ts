/**
 * filingStatus.ts — 申告ステータスルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  listFilingStatusesHandler,
  listFilingStatusesRoute,
} from "../usecases/listFilingStatuses";
import {
  updateFilingStatusHandler,
  updateFilingStatusRoute,
} from "../usecases/updateFilingStatus";

const app = new OpenAPIHono();
app.openapi(listFilingStatusesRoute, listFilingStatusesHandler);
app.openapi(updateFilingStatusRoute, updateFilingStatusHandler);

export default app;
