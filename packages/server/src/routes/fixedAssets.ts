/**
 * fixedAssets.ts — 固定資産台帳ルートの登録（routes: 登録のみ、ロジックは持たない）。
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { validationHook } from "../lib/validationHook";
import {
  attachFixedAssetImageHandler,
  attachFixedAssetImageRoute,
} from "../usecases/attachFixedAssetImage";
import {
  createFixedAssetHandler,
  createFixedAssetRoute,
} from "../usecases/createFixedAsset";
import {
  detachFixedAssetImageHandler,
  detachFixedAssetImageRoute,
} from "../usecases/detachFixedAssetImage";
import {
  getFixedAssetImageContentHandler,
  getFixedAssetImageContentRoute,
} from "../usecases/getFixedAssetImageContent";
import {
  listFixedAssetImagesHandler,
  listFixedAssetImagesRoute,
} from "../usecases/listFixedAssetImages";
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
app.openapi(
  getDepreciationScheduleRoute,
  getDepreciationScheduleHandler,
  validationHook(() => "year は西暦で指定してください"),
);
app.openapi(updateFixedAssetRoute, updateFixedAssetHandler);
app.openapi(deleteFixedAssetRoute, deleteFixedAssetHandler);
app.openapi(attachFixedAssetImageRoute, attachFixedAssetImageHandler);
app.openapi(listFixedAssetImagesRoute, listFixedAssetImagesHandler);
app.openapi(detachFixedAssetImageRoute, detachFixedAssetImageHandler);
app.openapi(getFixedAssetImageContentRoute, getFixedAssetImageContentHandler);

export default app;
