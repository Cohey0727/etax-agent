/**
 * freee.ts — freee連携系ルートの登録（routes: 登録のみ）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  getFreeeTrialBalanceHandler,
  getFreeeTrialBalanceRoute,
} from "../usecases/getFreeeTrialBalance";

const app = new OpenAPIHono();
app.openapi(getFreeeTrialBalanceRoute, getFreeeTrialBalanceHandler);

export default app;
