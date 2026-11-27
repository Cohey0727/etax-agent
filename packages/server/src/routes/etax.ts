/**
 * etax.ts — e-Tax 連携ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { taxYearValidationMessage, validationHook } from "../lib/validationHook";
import {
  exportConsumptionXtxHandler,
  exportConsumptionXtxRoute,
} from "../usecases/exportConsumptionXtx";
import {
  exportBlueReturnPdfHandler,
  exportBlueReturnPdfRoute,
} from "../usecases/exportBlueReturnPdf";
import {
  exportDomicilePdfHandler,
  exportDomicilePdfRoute,
} from "../usecases/exportDomicilePdf";
import {
  exportOpeningNoticePdfHandler,
  exportOpeningNoticePdfRoute,
} from "../usecases/exportOpeningNoticePdf";
import {
  exportReturnPdfHandler,
  exportReturnPdfRoute,
} from "../usecases/exportReturnPdf";
import { exportXtxHandler, exportXtxRoute } from "../usecases/exportXtx";

const app = new OpenAPIHono();
app.openapi(
  exportXtxRoute,
  exportXtxHandler,
  validationHook(taxYearValidationMessage),
);
app.openapi(
  exportReturnPdfRoute,
  exportReturnPdfHandler,
  validationHook(taxYearValidationMessage),
);
app.openapi(
  exportConsumptionXtxRoute,
  exportConsumptionXtxHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(
  exportDomicilePdfRoute,
  exportDomicilePdfHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(
  exportOpeningNoticePdfRoute,
  exportOpeningNoticePdfHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(
  exportBlueReturnPdfRoute,
  exportBlueReturnPdfHandler,
  validationHook(() => "JSONボディが必要です"),
);

export default app;
