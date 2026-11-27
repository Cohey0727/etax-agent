/**
 * classify.ts — 科目判定系ルートの登録（routes: 登録のみ）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { validationHook } from "../lib/validationHook";
import { classifyAccountHandler, classifyAccountRoute } from "../usecases/classifyAccount";
import {
  classifyAccountsBatchHandler,
  classifyAccountsBatchRoute,
} from "../usecases/classifyAccountsBatch";
import {
  recordClassificationFeedbackHandler,
  recordClassificationFeedbackRoute,
} from "../usecases/recordClassificationFeedback";
import { getJevPromptHandler, getJevPromptRoute } from "../usecases/getJevPrompt";
import { getRegexRulesHandler, getRegexRulesRoute } from "../usecases/getRegexRules";
import { updateJevPromptHandler, updateJevPromptRoute } from "../usecases/updateJevPrompt";
import { updateRegexRulesHandler, updateRegexRulesRoute } from "../usecases/updateRegexRules";

const app = new OpenAPIHono();
app.openapi(
  classifyAccountRoute,
  classifyAccountHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(
  classifyAccountsBatchRoute,
  classifyAccountsBatchHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(
  recordClassificationFeedbackRoute,
  recordClassificationFeedbackHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(getRegexRulesRoute, getRegexRulesHandler);
app.openapi(
  updateRegexRulesRoute,
  updateRegexRulesHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(getJevPromptRoute, getJevPromptHandler);
app.openapi(
  updateJevPromptRoute,
  updateJevPromptHandler,
  validationHook(() => "JSONボディが必要です"),
);

export default app;
