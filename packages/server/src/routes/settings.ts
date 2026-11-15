/**
 * settings.ts — 設定系ルートの登録（routes: 登録のみ）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import {
  getSystemOneSettingsHandler,
  getSystemOneSettingsRoute,
} from "../usecases/getSystemOneSettings";
import {
  testSystemOneSettingsHandler,
  testSystemOneSettingsRoute,
} from "../usecases/testSystemOneSettings";
import {
  testAgentSettingsHandler,
  testAgentSettingsRoute,
} from "../usecases/testAgentSettings";
import {
  updateSystemOneSettingsHandler,
  updateSystemOneSettingsRoute,
} from "../usecases/updateSystemOneSettings";

const app = new OpenAPIHono();
app.openapi(getSystemOneSettingsRoute, getSystemOneSettingsHandler);
app.openapi(
  updateSystemOneSettingsRoute,
  updateSystemOneSettingsHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  testSystemOneSettingsRoute,
  testSystemOneSettingsHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  testAgentSettingsRoute,
  testAgentSettingsHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);

export default app;
