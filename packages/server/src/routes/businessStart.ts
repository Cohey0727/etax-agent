/**
 * businessStart.ts — 開業届・青色申告承認申請書の専用入力のルート登録（routes）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  getBusinessStartInputsHandler,
  getBusinessStartInputsRoute,
} from "../usecases/getBusinessStartInputs";
import {
  saveBusinessStartInputsHandler,
  saveBusinessStartInputsRoute,
} from "../usecases/saveBusinessStartInputs";

const app = new OpenAPIHono();
app.openapi(getBusinessStartInputsRoute, getBusinessStartInputsHandler);
app.openapi(saveBusinessStartInputsRoute, saveBusinessStartInputsHandler);

export default app;
