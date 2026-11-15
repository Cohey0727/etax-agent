/**
 * taxpayer.ts — 納税者プロフィールルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  getTaxpayerProfileHandler,
  getTaxpayerProfileRoute,
} from "../usecases/getTaxpayerProfile";
import {
  saveTaxpayerProfileHandler,
  saveTaxpayerProfileRoute,
} from "../usecases/saveTaxpayerProfile";

const app = new OpenAPIHono();
app.openapi(getTaxpayerProfileRoute, getTaxpayerProfileHandler);
app.openapi(saveTaxpayerProfileRoute, saveTaxpayerProfileHandler);

export default app;
