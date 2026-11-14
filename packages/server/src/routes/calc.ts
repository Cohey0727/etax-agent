/**
 * calc.ts — 計算系ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { legacyValidationHook } from "../lib/validationHook";
import {
  calculateAggregateHandler,
  calculateAggregateRoute,
} from "../usecases/calculateAggregate";
import {
  calculateAmendmentHandler,
  calculateAmendmentRoute,
  calculateAmendmentValidationMessage,
} from "../usecases/calculateAmendment";
import {
  calculateConsumptionHandler,
  calculateConsumptionRoute,
} from "../usecases/calculateConsumption";

const app = new OpenAPIHono();
app.openapi(
  calculateAggregateRoute,
  calculateAggregateHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  calculateConsumptionRoute,
  calculateConsumptionHandler,
  legacyValidationHook(() => "JSONボディが必要です"),
);
app.openapi(
  calculateAmendmentRoute,
  calculateAmendmentHandler,
  legacyValidationHook(calculateAmendmentValidationMessage),
);

export default app;
