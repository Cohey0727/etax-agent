/**
 * receipts.ts — 領収書画像系ルートの登録（routes: 登録のみ）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import { analyzeReceiptHandler, analyzeReceiptRoute } from "../usecases/analyzeReceipt";

const app = new OpenAPIHono();
app.openapi(
  analyzeReceiptRoute,
  analyzeReceiptHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);

export default app;
