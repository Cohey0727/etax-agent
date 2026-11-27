/**
 * filingInputs.ts — 申告入力のルート登録（routes）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { validationHook } from "../lib/validationHook";
import { getFilingInputsHandler, getFilingInputsRoute } from "../usecases/getFilingInputs";
import {
  saveFilingInputsHandler,
  saveFilingInputsRoute,
  saveFilingInputsValidationMessage,
} from "../usecases/saveFilingInputs";

const app = new OpenAPIHono();
app.openapi(getFilingInputsRoute, getFilingInputsHandler);
app.openapi(
  saveFilingInputsRoute,
  saveFilingInputsHandler,
  validationHook(saveFilingInputsValidationMessage),
);

export default app;
