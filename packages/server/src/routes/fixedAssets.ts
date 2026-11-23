/**
 * fixedAssets.ts — 固定資産台帳ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createFixedAssetHandler,
  createFixedAssetRoute,
} from "../usecases/createFixedAsset";
import {
  deleteFixedAssetHandler,
  deleteFixedAssetRoute,
} from "../usecases/deleteFixedAsset";
import {
  getDepreciationScheduleHandler,
  getDepreciationScheduleRoute,
} from "../usecases/getDepreciationSchedule";
import {
  listFixedAssetsHandler,
  listFixedAssetsRoute,
} from "../usecases/listFixedAssets";
import {
  updateFixedAssetHandler,
  updateFixedAssetRoute,
} from "../usecases/updateFixedAsset";

const app = new OpenAPIHono();
app.openapi(listFixedAssetsRoute, listFixedAssetsHandler);
app.openapi(createFixedAssetRoute, createFixedAssetHandler);
app.openapi(getDepreciationScheduleRoute, getDepreciationScheduleHandler);
app.openapi(updateFixedAssetRoute, updateFixedAssetHandler);
app.openapi(deleteFixedAssetRoute, deleteFixedAssetHandler);

export default app;
