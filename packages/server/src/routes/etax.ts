/**
 * etax.ts — e-Tax 連携ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import {
  exportConsumptionXtxHandler,
  exportConsumptionXtxRoute,
} from "../usecases/exportConsumptionXtx";
import { exportXtxHandler, exportXtxRoute } from "../usecases/exportXtx";

const app = new OpenAPIHono();
app.openapi(
  exportXtxRoute,
  exportXtxHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  exportConsumptionXtxRoute,
  exportConsumptionXtxHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);

export default app;
