/**
 * calc.ts — 計算系ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { taxYearValidationMessage, validationHook } from "../lib/validationHook";
import {
  calculateAggregateHandler,
  calculateAggregateRoute,
} from "../usecases/calculateAggregate";
import {
  calculateTrialBalanceHandler,
  calculateTrialBalanceRoute,
} from "../usecases/calculateTrialBalance";
import {
  calculateAmendmentHandler,
  calculateAmendmentRoute,
  calculateAmendmentValidationMessage,
} from "../usecases/calculateAmendment";
import {
  calculateConsumptionHandler,
  calculateConsumptionRoute,
} from "../usecases/calculateConsumption";
import {
  calculateIncomeTaxHandler,
  calculateIncomeTaxRoute,
} from "../usecases/calculateIncomeTax";

const app = new OpenAPIHono();
app.openapi(
  calculateAggregateRoute,
  calculateAggregateHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(
  calculateTrialBalanceRoute,
  calculateTrialBalanceHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(
  calculateConsumptionRoute,
  calculateConsumptionHandler,
  validationHook(() => "JSONボディが必要です"),
);
app.openapi(
  calculateAmendmentRoute,
  calculateAmendmentHandler,
  validationHook(calculateAmendmentValidationMessage),
);
app.openapi(
  calculateIncomeTaxRoute,
  calculateIncomeTaxHandler,
  validationHook(taxYearValidationMessage),
);

export default app;
