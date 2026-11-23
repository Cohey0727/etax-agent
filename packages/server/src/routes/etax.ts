/**
 * etax.ts — e-Tax 連携ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import {
  exportConsumptionXtxHandler,
  exportConsumptionXtxRoute,
} from "../usecases/exportConsumptionXtx";
import {
  exportDomicilePdfHandler,
  exportDomicilePdfRoute,
} from "../usecases/exportDomicilePdf";
import {
  exportReturnPdfHandler,
  exportReturnPdfRoute,
} from "../usecases/exportReturnPdf";
import { exportXtxHandler, exportXtxRoute } from "../usecases/exportXtx";

const app = new OpenAPIHono();
app.openapi(
  exportXtxRoute,
  exportXtxHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  exportReturnPdfRoute,
  exportReturnPdfHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  exportConsumptionXtxRoute,
  exportConsumptionXtxHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  exportDomicilePdfRoute,
  exportDomicilePdfHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);

export default app;
