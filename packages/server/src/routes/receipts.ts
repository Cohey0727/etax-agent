/**
 * receipts.ts — 領収書・証憑系ルートの登録（routes: 登録のみ）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import { analyzeReceiptHandler, analyzeReceiptRoute } from "../usecases/analyzeReceipt";
import { getReceiptContentHandler, getReceiptContentRoute } from "../usecases/getReceiptContent";
import { linkReceiptHandler, linkReceiptRoute } from "../usecases/linkReceipt";
import { listReceiptsHandler, listReceiptsRoute } from "../usecases/listReceipts";
import {
  listTransactionReceiptsHandler,
  listTransactionReceiptsRoute,
} from "../usecases/listTransactionReceipts";
import { unlinkReceiptHandler, unlinkReceiptRoute } from "../usecases/unlinkReceipt";

const app = new OpenAPIHono();
app.openapi(
  analyzeReceiptRoute,
  analyzeReceiptHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(listReceiptsRoute, listReceiptsHandler);
app.openapi(getReceiptContentRoute, getReceiptContentHandler);
app.openapi(linkReceiptRoute, linkReceiptHandler);
app.openapi(unlinkReceiptRoute, unlinkReceiptHandler);
app.openapi(listTransactionReceiptsRoute, listTransactionReceiptsHandler);

export default app;
