/**
 * classify.ts — 科目判定系ルートの登録（routes: 登録のみ）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import { classifyAccountHandler, classifyAccountRoute } from "../usecases/classifyAccount";
import {
  classifyAccountsBatchHandler,
  classifyAccountsBatchRoute,
} from "../usecases/classifyAccountsBatch";
import {
  recordClassificationFeedbackHandler,
  recordClassificationFeedbackRoute,
} from "../usecases/recordClassificationFeedback";
import {
  getGeneratedRulesHandler,
  getGeneratedRulesRoute,
} from "../usecases/getGeneratedRules";
import {
  getClassificationHistoryHandler,
  getClassificationHistoryRoute,
} from "../usecases/getClassificationHistory";

const app = new OpenAPIHono();
app.openapi(
  classifyAccountRoute,
  classifyAccountHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  classifyAccountsBatchRoute,
  classifyAccountsBatchHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  recordClassificationFeedbackRoute,
  recordClassificationFeedbackHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(getGeneratedRulesRoute, getGeneratedRulesHandler);
app.openapi(getClassificationHistoryRoute, getClassificationHistoryHandler);

export default app;
